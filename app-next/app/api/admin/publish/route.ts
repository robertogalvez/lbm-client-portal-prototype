// Manual "Publish now" — lets an admin/AM trigger the native publish pipeline for
// a single task from the portal, instead of waiting for the webhook/reconcile.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { publishVideo } from '@/lib/publish/publish-video';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);
  if (!caller || (caller.role !== 'admin' && caller.role !== 'account_manager')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { taskId } = (await req.json()) as { taskId?: string };
  if (!taskId) return NextResponse.json({ error: 'Missing taskId' }, { status: 400 });

  try {
    const outcome = await publishVideo(taskId);
    return NextResponse.json({ ok: true, ...outcome });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
