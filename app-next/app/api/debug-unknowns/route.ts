import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { isNull } from 'drizzle-orm';

const BASE = 'https://api.clickup.com/api/v2';

export async function GET() {
  // 1. Pull every row from the DB that has null clientName
  const unknownRows = await db
    .select({
      clickupTaskId: videoCache.clickupTaskId,
      title:         videoCache.title,
      status:        videoCache.status,
      clientId:      videoCache.clientId,
      lastSyncedAt:  videoCache.lastSyncedAt,
    })
    .from(videoCache)
    .where(isNull(videoCache.clientName));

  if (unknownRows.length === 0) {
    return NextResponse.json({ message: 'No unknown-client tasks in DB', count: 0 });
  }

  // 2. Fetch each task directly from ClickUp so we can see the raw field values
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) {
    return NextResponse.json({ dbUnknowns: unknownRows, error: 'CLICKUP_API_TOKEN not set — cannot fetch raw ClickUp data' });
  }

  const clickupDetails = await Promise.all(
    unknownRows.map(async (row) => {
      try {
        const res = await fetch(`${BASE}/task/${row.clickupTaskId}`, {
          headers: { Authorization: token },
          cache: 'no-store',
        });
        const task = await res.json();
        const clientField = (task.custom_fields ?? []).find((f: any) => f.name === 'Client Name (AM)');
        return {
          clickupTaskId: row.clickupTaskId,
          title:         row.title,
          dbStatus:      row.status,
          lastSyncedAt:  row.lastSyncedAt,
          clickupStatus: task.status?.status ?? null,
          clientFieldPresent:  clientField !== undefined,
          clientFieldValue:    clientField?.value ?? 'MISSING',
          clientFieldValueType: typeof clientField?.value,
          typeConfigPresent:   !!(clientField?.type_config?.options?.length),
          typeConfigOptionCount: clientField?.type_config?.options?.length ?? 0,
          parent: task.parent ?? null,
        };
      } catch (e) {
        return { clickupTaskId: row.clickupTaskId, title: row.title, error: String(e) };
      }
    })
  );

  return NextResponse.json({
    count: unknownRows.length,
    tasks: clickupDetails,
  });
}
