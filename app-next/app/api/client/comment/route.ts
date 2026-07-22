import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveTaskClientName, type ClickUpTask } from '@/lib/clickup';
import { createComment as createFrameioComment } from '@/lib/frameio';
import { getViewAsClient } from '@/lib/view-as';

// POST /api/client/comment
// Posts a timestamped comment to Frame.io v4 ONLY. ClickUp is deliberately
// NOT written here — every comment left during review gets combined into a
// single ClickUp comment at decision time (see lib/frameio-comment-sync.ts),
// posted only when the client clicks Approve or Request changes.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user] = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Support both actual clients and staff (admin/AM) viewing as a client —
  // matches the pattern already used by /api/client/approve. Without this,
  // every comment attempt made via "View As" (admin/AM testing) 403s.
  let effectiveClientName = user.clientName;
  const isStaff = user.role === 'admin' || user.role === 'account_manager';
  if (isStaff) {
    const viewAsClient = await getViewAsClient();
    if (viewAsClient) effectiveClientName = viewAsClient.name;
  }
  if (!effectiveClientName) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (user.role !== 'client' && !isStaff) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { taskId, fileId, text, timestampSeconds } = await req.json() as {
    taskId: string;
    fileId?: string;
    text: string;
    timestampSeconds?: number;
  };

  if (!taskId || !text) return NextResponse.json({ error: 'taskId and text are required' }, { status: 400 });
  if (!fileId) return NextResponse.json({ error: 'fileId is required' }, { status: 400 });

  // Tenant isolation: never let a client comment on a task that isn't theirs.
  const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: process.env.CLICKUP_API_TOKEN ?? '' },
  });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json() as ClickUpTask;
  if (resolveTaskClientName(task) !== effectiveClientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Server-side, OAuth-authenticated — never touches Frame.io's guest
  // "who are you" identity flow.
  try {
    const comment = await createFrameioComment(fileId, text, timestampSeconds);
    return NextResponse.json({ ok: true, frameioCommentId: comment.id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save comment to Frame.io' }, { status: 502 });
  }
}
