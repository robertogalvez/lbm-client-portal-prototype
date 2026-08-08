import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, pendingDecisions, frameioSyncedComments } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getViewAsClient } from '@/lib/view-as';
import { resolveTaskClientName, type ClickUpTask } from '@/lib/clickup';

const BASE = 'https://api.clickup.com/api/v2';
const UNDO_WINDOW_MS = 30_000;

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
// Stores the decision for 30s while the client may undo, then returns
// { pending: true, decisionId, executeAfter } — the client calls
// POST /api/client/approve/execute after the countdown, or
// DELETE /api/client/approve/undo to cancel.
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

  // 409 guard: "post as is" is only valid when there are no unmirrored Frame.io
  // comments — otherwise the client must explicitly choose what to do with their notes.
  if (action === 'approve') {
    const frameField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'Updated Frame Link (Editor)');
    const frameLink = typeof frameField?.value === 'string' ? frameField.value : null;
    if (frameLink) {
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
  }

  // Store the pending decision — client has 30 s to undo
  const executeAfter = new Date(Date.now() + UNDO_WINDOW_MS);
  const [decision] = await db.insert(pendingDecisions).values({
    taskId,
    action,
    payload: { taskId, action, feedbackText, noteItems, userName: userRow.name } as Record<string, unknown>,
    executeAfter,
    userId: session.user.id,
    clientName: effectiveClientName,
  }).returning({ id: pendingDecisions.id });

  // Log all outcome choices (especially "post as is" — brief §2.2)
  console.log('[approve] decision queued', {
    decisionId: decision.id,
    userId: session.user.id,
    clientName: effectiveClientName,
    action,
    taskId,
    at: new Date().toISOString(),
  });

  return NextResponse.json({ pending: true, decisionId: decision.id, executeAfter: executeAfter.toISOString() });
}

function extractAssetId(frameLink: string): string {
  const match = frameLink.match(/\/(?:reviews|presentations|assets)\/([a-f0-9-]{36})/i);
  return match?.[1] ?? '';
}
