import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { revalidateTag } from 'next/cache';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, pendingDecisions } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getViewAsClient } from '@/lib/view-as';
import { resolveTaskClientName, mapTask, type ClickUpTask } from '@/lib/clickup';
import { setTaskStatus, postComment, TASK_STATUS, CLIENT_APPROVAL, createClientFixesChecklist } from '@/lib/clickup-write';
import { syncFrameioComments, countUnmirroredComments } from '@/lib/frameio-comment-sync';
import { notifyAmOfDecision } from '@/lib/notify-am';
import { sendSms, isSmsConfigured } from '@/lib/sms';

const BASE = 'https://api.clickup.com/api/v2';

// Michel gets a direct heads-up (Google Voice number) any time a client
// approves a video, on top of the Client Approvals chat post. Env var first
// so it can change without a redeploy; the literal is just the fallback
// captured from the requirements meeting.
const MICHEL_SMS_NUMBER = process.env.MICHEL_SMS_NUMBER || '+12017548711';

function clickupHeaders() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

type ApproveAction = 'approve' | 'approve_with_fixes' | 'changes';

// POST /api/client/approve
// Body: { taskId, action, feedbackText?, noteItems? }
//
// The client has already shown its own "are you sure — this can't be
// undone" confirmation before calling this, so the ClickUp writes happen
// synchronously in this one request. No deferred/undoable window.
export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    // Never let an uncaught throw (a malformed ClickUp response, a DB blip,
    // anything) fall through to whatever generic error response the runtime
    // produces — that can come back empty/non-JSON, and the client's
    // res.json() turns that into a cryptic "Unexpected end of JSON input"
    // instead of a message anyone can act on.
    console.error('[approve] unhandled error', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

async function handlePost(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name, isAlsoClient: authUsers.isAlsoClient })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let effectiveClientName = userRow.clientName;
  const isStaff = userRow.role === 'admin' || userRow.role === 'account_manager';
  if (isStaff) {
    const viewAsClient = await getViewAsClient();
    if (viewAsClient) effectiveClientName = viewAsClient.name;
  }

  if (!effectiveClientName) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (userRow.role !== 'client' && !isStaff && !userRow.isAlsoClient) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { taskId?: string; action?: ApproveAction; feedbackText?: string; noteItems?: string[] };
  const { taskId, action, feedbackText, noteItems } = body;
  if (!taskId || !action) return NextResponse.json({ error: 'Missing taskId or action' }, { status: 400 });
  if (!['approve', 'approve_with_fixes', 'changes'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  // Fetch the task for tenant isolation
  const taskRes = await fetch(`${BASE}/task/${taskId}`, { headers: clickupHeaders() });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json() as ClickUpTask;

  if (resolveTaskClientName(task) !== effectiveClientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const frameField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'Updated Frame Link (Editor)');
  const frameLink = typeof frameField?.value === 'string' ? frameField.value : null;

  // 409 guard: "post as is" is only valid when there are no unmirrored Frame.io
  // comments — otherwise the client must explicitly choose what to do with
  // their notes. Was previously a broken ad-hoc fetch using an env var
  // (FRAMEIO_ACCESS_TOKEN) that's never set anywhere, plus a divergent
  // endpoint shape — it 401'd, was swallowed, and this guard silently never
  // fired. Now reuses the same Frame.io calls syncFrameioComments already
  // relies on. Fails open on any Frame.io error (outage, wrong-account
  // auth) — a Frame.io problem must never block an approval, it just means
  // this soft safety net can't do its job for now.
  if (action === 'approve' && frameLink) {
    try {
      const unmirroredCount = await countUnmirroredComments(taskId, frameLink);
      if (unmirroredCount > 0) {
        return NextResponse.json({
          error: 'approve_blocked_by_unmirrored_notes',
          unmirroredCount,
          message: 'This video has notes not yet sent to the team. Choose what to do with them first.',
        }, { status: 409 });
      }
    } catch (e) {
      console.warn('[approve] unmirrored-notes guard could not reach Frame.io, proceeding anyway:', e instanceof Error ? e.message : e);
    }
  }

  // Audit record of the decision, executed in this same request.
  const [decision] = await db.insert(pendingDecisions).values({
    taskId,
    action,
    payload: { taskId, action, feedbackText, noteItems, userName: userRow.name } as Record<string, unknown>,
    executeAfter: new Date(),
    userId: session.user.id,
    clientName: effectiveClientName,
  }).returning({ id: pendingDecisions.id });

  console.log('[approve] decision recorded', {
    decisionId: decision.id,
    userId: session.user.id,
    clientName: effectiveClientName,
    action,
    taskId,
    at: new Date().toISOString(),
  });

  // Mirror Frame.io comments + optional extra note into ClickUp
  const authorName = userRow.name || effectiveClientName;
  const extraNote = feedbackText?.trim() ? { authorName, text: feedbackText.trim() } : undefined;

  // Set CLIENT APPROVAL field — exact option name per action, not a substring
  // guess (both "approve" outcomes contain "approv", so that used to collide).
  const approvalField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'CLIENT APPROVAL');
  if (!approvalField) return NextResponse.json({ error: 'CLIENT APPROVAL field not found' }, { status: 422 });

  // Both approve variants target the same real ClickUp option — the field's
  // live options are only APPROVED / REQUESTED CHANGES / DISCARDED, there is
  // no "APPROVED WITH COMMENTS" (confirmed against the live workspace). The
  // "fix the caption" distinction lives in the Client fixes checklist below,
  // not in this field.
  const targetApprovalName = action === 'changes' ? CLIENT_APPROVAL.changes : CLIENT_APPROVAL.approve;

  const options: { id: string; name: string }[] = approvalField.type_config?.options ?? [];
  const optionIndex = options.findIndex((o: { name: string }) => o.name.toLowerCase() === targetApprovalName.toLowerCase());
  if (optionIndex === -1) return NextResponse.json({ error: 'Approval option not found' }, { status: 422 });

  // These three writes/reads don't depend on each other's results, so they
  // run concurrently instead of one-after-another — this was the main source
  // of the multi-second "Saving…" delay clients reported.
  const [commentSync, updateRes] = await Promise.all([
    frameLink
      ? syncFrameioComments(taskId, frameLink, extraNote).catch(() => null)
      : extraNote
        ? postComment(taskId, `🎬 Client feedback:\n${authorName}: ${extraNote.text}`, false).then(
            () => ({ ok: true, posted: 1, alreadySynced: 0 }),
            () => ({ ok: false, posted: 0, alreadySynced: 0 }),
          )
        : Promise.resolve(null),
    fetch(`${BASE}/task/${taskId}/field/${approvalField.id}`, {
      method: 'POST',
      headers: clickupHeaders(),
      body: JSON.stringify({ value: optionIndex }),
    }),
  ]);
  if (!updateRes.ok) {
    const err = await updateRes.text();
    return NextResponse.json({ error: `ClickUp field update failed: ${err}` }, { status: 502 });
  }

  // Set task status. Both approve variants go straight to the posting queue
  // — "fix the caption" doesn't hold the video back, the AM is told
  // separately (below) to fix the caption in parallel. Only a real rejection
  // ("changes") routes through corrections.
  const targetStatus = action === 'changes' ? TASK_STATUS.inProgressCorrections : TASK_STATUS.readyToBePosted;
  const [, checklistResult] = await Promise.all([
    setTaskStatus(taskId, targetStatus).catch(() => { /* non-fatal */ }),
    action === 'approve_with_fixes' && noteItems && noteItems.length > 0
      ? createClientFixesChecklist(taskId, noteItems, new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })).catch(() => null as { checklistId: string; itemIds: string[] } | null)
      : Promise.resolve(null as { checklistId: string; itemIds: string[] } | null),
  ]);

  // Bust the 60s ClickUp task-list cache now that the writes above have
  // landed, so the client's own dashboard reflects this decision immediately
  // instead of possibly showing the pre-decision status for up to a minute.
  // { expire: 0 } forces an immediate blocking miss on the next fetch — the
  // recommended profile="max" (stale-while-revalidate) would still be able
  // to serve one more stale read before refreshing in the background, which
  // is exactly the staleness this fix needs to eliminate.
  revalidateTag('clickup-tasks', { expire: 0 });

  await db.update(pendingDecisions).set({ executed: true }).where(eq(pendingDecisions.id, decision.id));

  // Notify AM, post to the Client Approvals chat channel, and text Michel —
  // none of these block the response the client is waiting on.
  const mapped = mapTask(task);
  const videoTitle = mapped.clientFacingTitle || mapped.title;
  notifyAmOfDecision({
    assignedAmName: mapped.assignedAmName,
    taskId,
    videoTitle,
    action,
    clientName: effectiveClientName,
  }).catch(() => {});

  postToClientApprovalsChat(action, effectiveClientName, videoTitle).catch(() => {});

  if (action === 'approve' || action === 'approve_with_fixes') {
    notifyMichelOfApproval(effectiveClientName, videoTitle, action === 'approve_with_fixes').catch(() => {});
  }

  return NextResponse.json({ ok: true, decisionId: decision.id, action, optionName: options[optionIndex]?.name, commentSync, checklistResult });
}

async function notifyMichelOfApproval(clientName: string, videoTitle: string, captionNeedsFix: boolean) {
  if (!isSmsConfigured()) return;
  await sendSms({
    to: MICHEL_SMS_NUMBER,
    body: captionNeedsFix
      ? `${clientName} approved "${videoTitle}" but the caption needs a fix before it posts.`
      : `${clientName} approved "${videoTitle}".`,
  });
}

async function postToClientApprovalsChat(action: string, clientName: string, videoTitle: string) {
  const { emoji, verb } = action === 'changes'
    ? { emoji: '⚠️', verb: 'requested changes on' }
    : action === 'approve_with_fixes'
      ? { emoji: '✅📝', verb: 'approved (caption needs a fix) on' }
      : { emoji: '✅', verb: 'approved' };
  await fetch('https://api.clickup.com/api/v3/workspaces/90131939077/chat/channels/2ky4gfr5-81233/messages', {
    method: 'POST',
    headers: {
      Authorization: process.env.CLICKUP_API_TOKEN ?? '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: `${emoji} **${clientName}** ${verb} **${videoTitle}**`,
      content_format: 'text/md',
    }),
  });
}
