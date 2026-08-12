import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, pendingDecisions, frameioSyncedComments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getViewAsClient } from '@/lib/view-as';
import { resolveTaskClientName, mapTask, type ClickUpTask } from '@/lib/clickup';
import { setTaskStatus, postComment, TASK_STATUS, CLIENT_APPROVAL, createClientFixesChecklist } from '@/lib/clickup-write';
import { syncFrameioComments } from '@/lib/frameio-comment-sync';
import { notifyAmOfDecision } from '@/lib/notify-am';

const BASE = 'https://api.clickup.com/api/v2';

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
  // comments — otherwise the client must explicitly choose what to do with their notes.
  if (action === 'approve' && frameLink) {
    const assetId = extractAssetId(frameLink);
    if (assetId) {
      const frameioRes = await fetch(
        `https://api.frame.io/v4/assets/${assetId}/comments`,
        { headers: { Authorization: `Bearer ${process.env.FRAMEIO_ACCESS_TOKEN ?? ''}` }, cache: 'no-store' }
      ).catch(() => null);
      if (frameioRes?.ok) {
        const frameioData = await frameioRes.json().catch(() => ({ data: [] })) as { data?: { id: string }[] };
        const allComments = frameioData?.data ?? [];
        const syncedRows = await db
          .select({ frameioCommentId: frameioSyncedComments.frameioCommentId })
          .from(frameioSyncedComments)
          .where(eq(frameioSyncedComments.clickupTaskId, taskId));
        const syncedSet = new Set(syncedRows.map(r => r.frameioCommentId));
        const unmirrored = allComments.filter(c => !syncedSet.has(c.id));
        if (unmirrored.length > 0) {
          return NextResponse.json({
            error: 'approve_blocked_by_unmirrored_notes',
            unmirroredCount: unmirrored.length,
            message: 'This video has notes not yet sent to the team. Choose what to do with them first.',
          }, { status: 409 });
        }
      }
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

  const commentSync = frameLink
    ? await syncFrameioComments(taskId, frameLink, extraNote).catch(() => null)
    : extraNote
      ? await postComment(taskId, `🎬 Client feedback:\n${authorName}: ${extraNote.text}`, false).then(
          () => ({ ok: true, posted: 1, alreadySynced: 0 }),
          () => ({ ok: false, posted: 0, alreadySynced: 0 }),
        )
      : null;

  // Set CLIENT APPROVAL field — exact option name per action, not a substring
  // guess (both "approve" outcomes contain "approv", so that used to collide).
  const approvalField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'CLIENT APPROVAL');
  if (!approvalField) return NextResponse.json({ error: 'CLIENT APPROVAL field not found' }, { status: 422 });

  const targetApprovalName = action === 'changes' ? CLIENT_APPROVAL.changes
    : action === 'approve_with_fixes' ? CLIENT_APPROVAL.approveWithFixes
    : CLIENT_APPROVAL.approve;

  const options: { id: string; name: string }[] = approvalField.type_config?.options ?? [];
  const optionIndex = options.findIndex((o: { name: string }) => o.name.toLowerCase() === targetApprovalName.toLowerCase());
  if (optionIndex === -1) return NextResponse.json({ error: 'Approval option not found' }, { status: 422 });

  const updateRes = await fetch(`${BASE}/task/${taskId}/field/${approvalField.id}`, {
    method: 'POST',
    headers: clickupHeaders(),
    body: JSON.stringify({ value: optionIndex }),
  });
  if (!updateRes.ok) {
    const err = await updateRes.text();
    return NextResponse.json({ error: `ClickUp field update failed: ${err}` }, { status: 502 });
  }

  // Set task status. "Approve — apply my notes first" and "Send back for
  // changes" both route through corrections; the CLIENT APPROVAL value set
  // above is what tells the AM which one it was.
  const targetStatus = action === 'approve' ? TASK_STATUS.readyToBePosted : TASK_STATUS.inProgressCorrections;
  try { await setTaskStatus(taskId, targetStatus); } catch { /* non-fatal */ }

  // Create ClickUp checklist from note items for approve_with_fixes
  let checklistResult: { checklistId: string; itemIds: string[] } | null = null;
  if (action === 'approve_with_fixes' && noteItems && noteItems.length > 0) {
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    checklistResult = await createClientFixesChecklist(taskId, noteItems, dateLabel);
  }

  await db.update(pendingDecisions).set({ executed: true }).where(eq(pendingDecisions.id, decision.id));

  // Notify AM
  const mapped = mapTask(task);
  const videoTitle = mapped.clientFacingTitle || mapped.title;
  await notifyAmOfDecision({
    assignedAmName: mapped.assignedAmName,
    taskId,
    videoTitle,
    action: action === 'approve_with_fixes' ? 'approve' : (action as 'approve' | 'changes'),
    clientName: effectiveClientName,
  }).catch(() => {});

  // Post to Client Approvals chat channel
  postToClientApprovalsChat(action, effectiveClientName, videoTitle).catch(() => {});

  return NextResponse.json({ ok: true, decisionId: decision.id, action, optionName: options[optionIndex]?.name, commentSync, checklistResult });
}

function extractAssetId(frameLink: string): string {
  const match = frameLink.match(/\/(?:reviews|presentations|assets)\/([a-f0-9-]{36})/i);
  return match?.[1] ?? '';
}

async function postToClientApprovalsChat(action: string, clientName: string, videoTitle: string) {
  const emoji = action === 'changes' ? '⚠️' : '✅';
  const verb = action === 'changes' ? 'requested changes on' : 'approved';
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
