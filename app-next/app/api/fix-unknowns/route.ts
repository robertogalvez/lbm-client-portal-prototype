import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { videoCache, authUsers } from '@/lib/db/schema';
import { isNull, eq } from 'drizzle-orm';

const BASE = 'https://api.clickup.com/api/v2';

// POST: fetch each null-clientName task individually from ClickUp and patch the DB
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });

  const unknownRows = await db
    .select({ clickupTaskId: videoCache.clickupTaskId })
    .from(videoCache)
    .where(isNull(videoCache.clientName));

  let fixed = 0;
  let noValue = 0;
  let failed = 0;
  const noValueTasks: string[] = [];
  const failedTasks: string[] = [];

  // Bounded concurrency: fetch/patch a handful of tasks at a time instead of
  // one-by-one, without hammering the ClickUp rate limit.
  const CONCURRENCY = 8;
  for (let i = 0; i < unknownRows.length; i += CONCURRENCY) {
    await Promise.all(unknownRows.slice(i, i + CONCURRENCY).map(async row => {
      const res = await fetch(`${BASE}/task/${row.clickupTaskId}`, {
        headers: { Authorization: token },
        cache: 'no-store',
      });
      // Without this check an error body has no custom_fields, so the task
      // falls through to the noValue bucket and gets reported as "no Client
      // Name in ClickUp" when it was really a failed request — the exact
      // diagnosis this route exists to produce. Eight concurrent requests
      // make a 429 the likely case.
      if (!res.ok) {
        failed++;
        failedTasks.push(`${row.clickupTaskId} — ${res.status} ${res.statusText}`);
        return;
      }
      const task = await res.json();
      const clientField = (task.custom_fields ?? []).find((f: any) => f.name === 'Client Name (AM)');
      const idx = typeof clientField?.value === 'number' ? clientField.value : null;
      if (idx === null) {
        noValue++;
        noValueTasks.push(`${row.clickupTaskId} (${task.name})`);
        return;
      }
      const clientName: string | null = clientField?.type_config?.options?.[idx]?.name ?? null;
      const clientId: string | null   = clientField?.type_config?.options?.[idx]?.id ?? null;
      if (!clientName) {
        noValue++;
        noValueTasks.push(`${row.clickupTaskId} (${task.name}) — idx ${idx} not in options`);
        return;
      }
      await db.update(videoCache)
        .set({ clientName, clientId })
        .where(eq(videoCache.clickupTaskId, row.clickupTaskId));
      fixed++;
    }));
  }

  return NextResponse.json({ fixed, noValue, noValueTasks, failed, failedTasks });
}

// GET: show what's still null (staff-only, same guard as POST)
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const unknownRows = await db
    .select({
      clickupTaskId: videoCache.clickupTaskId,
      title:         videoCache.title,
      status:        videoCache.status,
      lastSyncedAt:  videoCache.lastSyncedAt,
    })
    .from(videoCache)
    .where(isNull(videoCache.clientName));

  return NextResponse.json({ count: unknownRows.length, tasks: unknownRows });
}
