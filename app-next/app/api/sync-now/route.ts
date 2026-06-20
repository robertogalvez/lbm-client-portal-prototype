import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BASE = 'https://api.clickup.com/api/v2';

async function fetchAllTasksFromList(listId: string, token: string) {
  const all: any[] = [];
  let page = 0;
  while (true) {
    const res = await fetch(
      `${BASE}/list/${listId}/task?include_closed=true&page=${page}`,
      { headers: { Authorization: token } },
    );
    const data = await res.json();
    const tasks = data.tasks ?? [];
    all.push(...tasks);
    if (tasks.length < 100) break;
    page++;
  }
  return all;
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });
  if (!listId) return NextResponse.json({ error: 'CLICKUP_LIST_ID not set' }, { status: 500 });

  const rawTasks = await fetchAllTasksFromList(listId, token);

  // Extract option maps once — ClickUp only includes type_config on some tasks, not all.
  const fieldOptions: Record<string, any[]> = {};
  for (const t of rawTasks) {
    for (const f of (t.custom_fields ?? []) as any[]) {
      if (!fieldOptions[f.name] && f.type_config?.options?.length) {
        fieldOptions[f.name] = f.type_config.options;
      }
    }
  }
  const resolveOpt = (name: string, idx: number | null) =>
    idx !== null ? (fieldOptions[name]?.[idx]?.name ?? null) : null;
  const resolveOptId = (name: string, idx: number | null) =>
    idx !== null ? (fieldOptions[name]?.[idx]?.id ?? null) : null;

  let synced = 0;
  let skipped = 0;

  for (const task of rawTasks) {
    const existing = await db.select({ dirty: videoCache.dirty })
      .from(videoCache)
      .where(eq(videoCache.clickupTaskId, task.id))
      .limit(1);

    if (existing[0]?.dirty) { skipped++; continue; }

    const fields = task.custom_fields ?? [];
    const find = (name: string) => fields.find((f: any) => f.name === name);

    const clientField   = find('Client Name (AM)');
    const levelField    = find('Video Level (AM)');
    const approvalField = find('CLIENT APPROVAL');
    const pubField      = find('Publishing Status');
    const captionField  = find('Captions');
    const frameField    = find('Updated Frame Link (Editor)');
    const amField       = find('Account Manager (AM)');
    const qcField       = find('QUALITY CHECK (Somu)');

    const clientIdx   = typeof clientField?.value === 'number' ? clientField.value : null;
    const levelIdx    = typeof levelField?.value === 'number' ? levelField.value : null;
    const approvalIdx = typeof approvalField?.value === 'number' ? approvalField.value : null;
    const pubIdx      = typeof pubField?.value === 'number' ? pubField.value : null;
    const qcIdx       = typeof qcField?.value === 'number' ? qcField.value : null;

    const amUsers    = amField?.value as { username?: string }[] | undefined;
    const amName     = amUsers?.[0]?.username ?? null;
    const editorName = (task.assignees as { username?: string }[])?.[0]?.username ?? null;

    let dueDate: string | null = null;
    if (task.due_date) {
      const ms = Number(task.due_date);
      dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
    }

    const row = {
      status:           task.status?.status ?? null,
      clientId:         resolveOptId('Client Name (AM)', clientIdx),
      clientApproval:   resolveOpt('CLIENT APPROVAL', approvalIdx),
      videoLevel:       resolveOpt('Video Level (AM)', levelIdx),
      caption:          typeof captionField?.value === 'string' ? captionField.value : null,
      publishingStatus: resolveOpt('Publishing Status', pubIdx),
      frameioAssetId:   typeof frameField?.value === 'string' ? frameField.value : null,
      assignedAmName:   amName,
      editorName,
      clientName:       resolveOpt('Client Name (AM)', clientIdx),
      qualityCheck:     resolveOpt('QUALITY CHECK (Somu)', qcIdx),
      dateUpdated:      task.date_updated ?? null,
      dueDate,
      lastSyncedAt:     new Date(),
      dirty:            false,
    };

    await db.insert(videoCache).values({ clickupTaskId: task.id, title: task.name, ...row })
      .onConflictDoUpdate({ target: videoCache.clickupTaskId, set: row });
    synced++;
  }

  return NextResponse.json({ synced, skipped, total: rawTasks.length });
}
