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
      `${BASE}/list/${listId}/task?subtasks=true&include_closed=true&custom_fields=true&page=${page}`,
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

  const rawTasks = masterListId
    ? await fetchAllTasksFromList(masterListId, token)
    : await fetchAllTasksFromFolder(folderId!, token);

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
    const clientName = clientField && clientIdx !== null ? resolveOptionName(clientField, clientIdx) : null;
    const qualityCheck = qcField && qcIdx !== null ? resolveOptionName(qcField, qcIdx) : null;

    let dueDate: string | null = null;
    if (task.due_date) {
      const ms = Number(task.due_date);
      dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
    }

    await db.insert(videoCache).values({
      clickupTaskId:    task.id,
      clientId:         clientField && clientIdx !== null ? resolveOptionId(clientField, clientIdx) : null,
      title:            task.name,
      status:           task.status?.status ?? null,
      clientApproval:   approvalField && approvalIdx !== null ? resolveOptionName(approvalField, approvalIdx) : null,
      videoLevel:       levelField && levelIdx !== null ? resolveOptionName(levelField, levelIdx) : null,
      caption:          typeof captionField?.value === 'string' ? captionField.value : null,
      publishingStatus: pubField && pubIdx !== null ? resolveOptionName(pubField, pubIdx) : null,
      frameioAssetId:   typeof frameField?.value === 'string' ? frameField.value : null,
      assignedAmName:   amName,
      editorName,
      clientName,
      qualityCheck,
      dateUpdated:      task.date_updated ?? null,
      dueDate,
      lastSyncedAt:     new Date(),
      dirty:            false,
    }).onConflictDoUpdate({
      target: videoCache.clickupTaskId,
      set: {
        status:           task.status?.status ?? null,
        clientApproval:   approvalField && approvalIdx !== null ? resolveOptionName(approvalField, approvalIdx) : null,
        videoLevel:       levelField && levelIdx !== null ? resolveOptionName(levelField, levelIdx) : null,
        caption:          typeof captionField?.value === 'string' ? captionField.value : null,
        publishingStatus: pubField && pubIdx !== null ? resolveOptionName(pubField, pubIdx) : null,
        frameioAssetId:   typeof frameField?.value === 'string' ? frameField.value : null,
        assignedAmName:   amName,
        editorName,
        clientName,
        qualityCheck,
        dateUpdated:      task.date_updated ?? null,
        dueDate,
        lastSyncedAt:     new Date(),
        dirty:            false,
      },
    });
    synced++;
  }

  return NextResponse.json({ synced, skipped, total: rawTasks.length });
}
