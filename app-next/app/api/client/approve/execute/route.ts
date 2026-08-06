import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, pendingDecisions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { mapTask, type ClickUpTask } from '@/lib/clickup';
import { setTaskStatus, postComment, TASK_STATUS, createClientFixesChecklist } from '@/lib/clickup-write';
import { syncFrameioComments } from '@/lib/frameio-comment-sync';
import { notifyAmOfDecision } from '@/lib/notify-am';

const BASE = 'https://api.clickup.com/api/v2';

function clickupHeaders() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

// POST /api/client/approve/execute  { decisionId }
// Applies the deferred ClickUp writes for a stored pending decision.
// Called by the client countdown timer after 30 s; also callable by the sync
// job for decisions where the client closed the tab before the window expired.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { decisionId } = await req.json() as { decisionId?: string };
  if (!decisionId) return NextResponse.json({ error: 'Missing decisionId' }, { status: 400 });

  const [row] = await db
    .select()
    .from(pendingDecisions)
    .where(and(eq(pendingDecisions.id, decisionId), eq(pendingDecisions.executed, false)))
    .limit(1);

  if (!row) return NextResponse.json({ error: 'Decision not found or already executed' }, { status: 404 });

  // Staff (sync job) may execute any decision; clients only their own
  const [userRow] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  const isStaff = userRow?.role === 'admin' || userRow?.role === 'account_manager';
  if (!isStaff && row.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const payload = row.payload as { taskId: string; action: string; feedbackText?: string; noteItems?: string[]; userName?: string };
  const { taskId, action, feedbackText, noteItems, userName } = payload;

  // Fetch the task fresh — the undo window has closed
  const taskRes = await fetch(`${BASE}/task/${taskId}`, { headers: clickupHeaders() });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json() as ClickUpTask;

  // Mirror Frame.io comments + optional extra note into ClickUp (deferred from decision time)
  const frameField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'Updated Frame Link (Editor)');
  const frameLink = typeof frameField?.value === 'string' ? frameField.value : null;
  const authorName = userName || row.clientName;
  const extraNote = feedbackText?.trim() ? { authorName, text: feedbackText.trim() } : undefined;

  const commentSync = frameLink
    ? await syncFrameioComments(taskId, frameLink, extraNote).catch(() => null)
    : extraNote
      ? await postComment(taskId, `🎬 Client feedback:\n${authorName}: ${extraNote.text}`, false).then(
          () => ({ ok: true, posted: 1, alreadySynced: 0 }),
          () => ({ ok: false, posted: 0, alreadySynced: 0 }),
        )
      : null;

  // Set CLIENT APPROVAL field
  const approvalField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'CLIENT APPROVAL');
  if (!approvalField) return NextResponse.json({ error: 'CLIENT APPROVAL field not found' }, { status: 422 });

  const options: { id: string; name: string }[] = approvalField.type_config?.options ?? [];
  const optionIndex = options.findIndex((o: { name: string }) =>
    o.name.toLowerCase().includes(action === 'changes' ? 'change' : 'approv')
  );
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

  // Set task status
  let targetStatus: string;
  if (action === 'changes') {
    targetStatus = 'in progress (corrections)';
  } else if (action === 'approve_with_fixes') {
    targetStatus = TASK_STATUS.approvedFixesPending;
  } else {
    targetStatus = TASK_STATUS.readyToBePosted;
  }

  if (action === 'approve_with_fixes') {
    // Fatal — the hold must be applied, or the approval should not proceed
    await setTaskStatus(taskId, targetStatus);
  } else {
    try { await setTaskStatus(taskId, targetStatus); } catch { /* non-fatal */ }
  }

  // Create ClickUp checklist from note items for approve_with_fixes
  let checklistResult: { checklistId: string; itemIds: string[] } | null = null;
  if (action === 'approve_with_fixes' && noteItems && noteItems.length > 0) {
    const dateLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    checklistResult = await createClientFixesChecklist(taskId, noteItems, dateLabel);
  }

  // Mark as executed
  await db.update(pendingDecisions).set({ executed: true }).where(eq(pendingDecisions.id, decisionId));

  // Notify AM
  const mapped = mapTask(task);
  await notifyAmOfDecision({
    assignedAmName: mapped.assignedAmName,
    taskId,
    videoTitle: mapped.clientFacingTitle || mapped.title,
    action: action === 'approve_with_fixes' ? 'approve' : (action as 'approve' | 'changes'),
    clientName: row.clientName,
  }).catch(() => {});

  return NextResponse.json({ ok: true, action, optionName: options[optionIndex]?.name, commentSync, checklistResult });
}
