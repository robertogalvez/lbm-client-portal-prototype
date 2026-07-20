import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveTaskClientName, type ClickUpTask } from '@/lib/clickup';

// POST /api/client/comment
// Posts a timestamped comment to Frame.io v4 AND as a ClickUp task comment
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [user] = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (!user || user.role !== 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { taskId, frameioAssetId, text, timestampSeconds } = await req.json() as {
    taskId: string;
    frameioAssetId?: string;
    text: string;
    timestampSeconds?: number;
  };

  if (!taskId || !text) return NextResponse.json({ error: 'taskId and text are required' }, { status: 400 });

  // Tenant isolation: never let a client comment on a task that isn't theirs.
  const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}`, {
    headers: { Authorization: process.env.CLICKUP_API_TOKEN ?? '' },
  });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json() as ClickUpTask;
  if (resolveTaskClientName(task) !== user.clientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const results: Record<string, unknown> = {};

  // 1. Post to Frame.io v4 (if we have an asset ID)
  if (frameioAssetId && process.env.FRAMEIO_API_TOKEN) {
    try {
      const body: Record<string, unknown> = { text };
      if (typeof timestampSeconds === 'number') body.timestamp = timestampSeconds;

      const fRes = await fetch(`https://api.frame.io/v4/assets/${frameioAssetId}/comments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FRAMEIO_API_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Api-Version': '2',
        },
        body: JSON.stringify(body),
      });
      const fData = await fRes.json();
      if (!fRes.ok) results.frameioError = fData;
      else results.frameioCommentId = fData.id;
    } catch (e) {
      results.frameioError = e instanceof Error ? e.message : 'Unknown';
    }
  }

  // 2. Post to ClickUp task as a comment
  try {
    const timestamp = typeof timestampSeconds === 'number'
      ? ` [at ${new Date(timestampSeconds * 1000).toISOString().substr(11, 8)}]`
      : '';
    const commentText = `💬 ${user.name} (portal)${timestamp}: ${text}`;

    const cRes = await fetch(`https://api.clickup.com/api/v2/task/${taskId}/comment`, {
      method: 'POST',
      headers: {
        Authorization: process.env.CLICKUP_API_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment_text: commentText, notify_all: false }),
    });
    const cData = await cRes.json();
    if (!cRes.ok) results.clickupError = cData;
    else results.clickupCommentId = cData.id;
  } catch (e) {
    results.clickupError = e instanceof Error ? e.message : 'Unknown';
  }

  return NextResponse.json({ ok: true, ...results });
}
