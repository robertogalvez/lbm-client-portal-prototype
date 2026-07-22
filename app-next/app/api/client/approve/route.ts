import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getViewAsClient } from '@/lib/view-as';
import { resolveTaskClientName, mapTask, type ClickUpTask } from '@/lib/clickup';
import { syncFrameioComments } from '@/lib/frameio-comment-sync';
import { setTaskStatus, postComment, TASK_STATUS } from '@/lib/clickup-write';
import { notifyAmOfDecision } from '@/lib/notify-am';

const BASE = 'https://api.clickup.com/api/v2';

function clickupHeaders() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Support both actual clients and admins viewing as clients
  let effectiveClientName = userRow.clientName;
  const isStaff = userRow.role === 'admin' || userRow.role === 'account_manager';
  if (isStaff) {
    const viewAsClient = await getViewAsClient();
    if (viewAsClient) {
      effectiveClientName = viewAsClient.name;
    }
  }

  if (!effectiveClientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (userRow.role !== 'client' && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { taskId, action, feedbackText } = body as { taskId?: string; action?: 'approve' | 'changes'; feedbackText?: string };
  if (!taskId || !action) return NextResponse.json({ error: 'Missing taskId or action' }, { status: 400 });

  // Fetch the task to get the CLIENT APPROVAL field ID and options
  const taskRes = await fetch(`${BASE}/task/${taskId}`, { headers: clickupHeaders() });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json() as ClickUpTask;

  // Tenant isolation: never let a client mutate a task that isn't theirs.
  if (resolveTaskClientName(task) !== effectiveClientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Decision-time capture: mirror any Frame.io comments the client left during
  // review — plus the optional "what needs to change" note — into ONE combined
  // ClickUp comment, BEFORE the approval field flips, so the AM sees the full
  // feedback the moment the decision lands. Sync failures never block the
  // approval write.
  const frameField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'Updated Frame Link (Editor)');
  const frameLink = typeof frameField?.value === 'string' ? frameField.value : null;
  const extraNote = feedbackText?.trim() ? { authorName: userRow.name ?? effectiveClientName, text: feedbackText.trim() } : undefined;
  const commentSync = frameLink
    ? await syncFrameioComments(taskId, frameLink, extraNote)
    : extraNote
      ? await postComment(taskId, `🎬 Client feedback:\n${extraNote.authorName}: ${extraNote.text}`, false).then(
          () => ({ ok: true, posted: 1, alreadySynced: 0 }),
          (e: unknown) => ({ ok: false, posted: 0, alreadySynced: 0, error: e instanceof Error ? e.message : String(e) }),
        )
      : null;

  const approvalField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'CLIENT APPROVAL');

  if (!approvalField) return NextResponse.json({ error: 'CLIENT APPROVAL field not found on task' }, { status: 422 });

  const options: { id: string; name: string }[] = approvalField.type_config?.options ?? [];
  const targetName = action === 'approve' ? 'Approved' : 'Changes Requested';
  const optionIndex = options.findIndex((o: { name: string }) =>
    o.name.toLowerCase().includes(action === 'approve' ? 'approv' : 'change')
  );

  if (optionIndex === -1) {
    return NextResponse.json({
      error: `Could not find "${targetName}" option in CLIENT APPROVAL field`,
      available: options.map(o => o.name),
    }, { status: 422 });
  }

  const updateRes = await fetch(`${BASE}/task/${taskId}/field/${approvalField.id}`, {
    method: 'POST',
    headers: clickupHeaders(),
    body: JSON.stringify({ value: optionIndex }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return NextResponse.json({ error: `ClickUp update failed: ${err}` }, { status: 502 });
  }

  // Move the task to the next pipeline stage — mirrors what an AM would do by
  // hand in ClickUp. Approve hands it to the posting board ("ready to be
  // posted"; the AM still has to check "Ready to Publish?" once title/captions/
  // etc. are confirmed before the publish pipeline will touch it). Changes
  // sends it back for a new editing pass. Also keeps the task OUT of "for
  // client review" once decided, so the portal's stale-approval guard
  // (lib/clickup.ts mapTask) only fires for a genuine new review round, not a
  // freshly-made decision the AM hasn't actioned yet — otherwise the client
  // could approve/reject again after a reload.
  // Non-fatal: the CLIENT APPROVAL decision above is already recorded even if this fails.
  let statusUpdate: { ok: boolean; error?: string } | null = null;
  try {
    await setTaskStatus(taskId, action === 'approve' ? TASK_STATUS.readyToBePosted : 'in progress (corrections)');
    statusUpdate = { ok: true };
  } catch (e) {
    statusUpdate = { ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }

  // Notify the AM outside of ClickUp itself (email/SMS, admin-configured per
  // AM in Settings) — the task comment alone is easy to miss. Best-effort.
  const mapped = mapTask(task);
  await notifyAmOfDecision({
    assignedAmName: mapped.assignedAmName,
    taskId,
    videoTitle: mapped.clientFacingTitle || mapped.title,
    action,
    clientName: effectiveClientName,
  });

  return NextResponse.json({ ok: true, action, optionName: options[optionIndex]?.name, commentSync, statusUpdate });
}
