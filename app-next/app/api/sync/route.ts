import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BASE = 'https://api.clickup.com/api/v2';

function resolveOptionName(field: any, valueIndex: number): string | null {
  return field?.type_config?.options?.[valueIndex]?.name ?? null;
}

function resolveOptionId(field: any, valueIndex: number): string | null {
  return field?.type_config?.options?.[valueIndex]?.id ?? null;
}

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

async function fetchAllTasksFromFolder(folderId: string, token: string) {
  const res = await fetch(`${BASE}/folder/${folderId}/list`, { headers: { Authorization: token } });
  const data = await res.json();
  const lists: any[] = data.lists ?? [];
  const results = await Promise.all(lists.map((l: any) => fetchAllTasksFromList(l.id, token)));
  return results.flat();
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.CLICKUP_API_TOKEN;
  const masterListId = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;

  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });
  if (!masterListId && !folderId) return NextResponse.json({ error: 'No ClickUp list/folder configured' }, { status: 500 });

  // Prioritize folder to get tasks from all lists (Quality Control Board has Revision # field)
  const rawTasks = folderId
    ? await fetchAllTasksFromFolder(folderId, token)
    : await fetchAllTasksFromList(masterListId!, token);

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
    const rawDriveField = find('Raw Drive Link (Videographer)');
    const amField       = find('Account Manager (AM)');
    const qcField       = find('QUALITY CHECK (Somu)');
    const revisionsField = find('Revision #');

    const clientIdx   = typeof clientField?.value === 'number' ? clientField.value : null;
    const levelIdx    = typeof levelField?.value === 'number' ? levelField.value : null;
    const approvalIdx = typeof approvalField?.value === 'number' ? approvalField.value : null;
    const pubIdx      = typeof pubField?.value === 'number' ? pubField.value : null;
    const qcIdx       = typeof qcField?.value === 'number' ? qcField.value : null;

    const amUsers    = amField?.value as { username?: string }[] | undefined;
    const amName     = amUsers?.[0]?.username ?? null;
    const editorName = (task.assignees as { username?: string }[])?.[0]?.username ?? null;
    const clientName   = resolveOpt('Client Name (AM)', clientIdx);
    const qualityCheck = resolveOpt('QUALITY CHECK (Somu)', qcIdx);

    let revisions: number | null = null;
    if (typeof revisionsField?.value === 'number') {
      revisions = revisionsField.value;
    } else if (typeof revisionsField?.value === 'string') {
      const parsed = parseInt(revisionsField.value, 10);
      revisions = isNaN(parsed) ? null : parsed;
    }

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
      rawDriveLink:     typeof rawDriveField?.value === 'string' ? rawDriveField.value : null,
      assignedAmName:   amName,
      editorName,
      clientName,
      qualityCheck,
      revisions,
      dateUpdated:      task.date_updated ?? null,
      dueDate,
      lastSyncedAt:     new Date(),
      dirty:            false,
    };

    await db.insert(videoCache).values({ clickupTaskId: task.id, title: task.name, ...row })
      .onConflictDoUpdate({
      target: videoCache.clickupTaskId,
      set: row,
    });
    synced++;
  }

  return NextResponse.json({ synced, skipped, total: rawTasks.length });
}
