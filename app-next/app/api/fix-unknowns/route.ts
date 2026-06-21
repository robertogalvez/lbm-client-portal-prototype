import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { isNull, eq } from 'drizzle-orm';

const BASE = 'https://api.clickup.com/api/v2';

// POST: fetch each null-clientName task individually from ClickUp and patch the DB
export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });

  const unknownRows = await db
    .select({ clickupTaskId: videoCache.clickupTaskId })
    .from(videoCache)
    .where(isNull(videoCache.clientName));

  let fixed = 0;
  let noValue = 0;
  const noValueTasks: string[] = [];

  for (const row of unknownRows) {
    const res = await fetch(`${BASE}/task/${row.clickupTaskId}`, {
      headers: { Authorization: token },
      cache: 'no-store',
    });
    const task = await res.json();
    const clientField = (task.custom_fields ?? []).find((f: any) => f.name === 'Client Name (AM)');
    const idx = typeof clientField?.value === 'number' ? clientField.value : null;
    if (idx === null) {
      noValue++;
      noValueTasks.push(`${row.clickupTaskId} (${task.name})`);
      continue;
    }
    const clientName: string | null = clientField?.type_config?.options?.[idx]?.name ?? null;
    const clientId: string | null   = clientField?.type_config?.options?.[idx]?.id ?? null;
    if (!clientName) {
      noValue++;
      noValueTasks.push(`${row.clickupTaskId} (${task.name}) — idx ${idx} not in options`);
      continue;
    }
    await db.update(videoCache)
      .set({ clientName, clientId })
      .where(eq(videoCache.clickupTaskId, row.clickupTaskId));
    fixed++;
  }

  return NextResponse.json({ fixed, noValue, noValueTasks });
}

// GET: same as debug-unknowns — show what's still null
export async function GET() {
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
