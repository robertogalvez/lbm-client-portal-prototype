import type { Config } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

// Inline schema to avoid bundling the full app
const { pgTable, varchar, text, timestamp, boolean } = await import('drizzle-orm/pg-core');

const videoCache = pgTable('video_cache', {
  clickupTaskId:     varchar('clickup_task_id', { length: 50 }).primaryKey(),
  clientId:          varchar('client_id', { length: 100 }),
  editorId:          varchar('editor_id', { length: 100 }),
  assignedAmId:      varchar('assigned_am_id', { length: 100 }),
  title:             text('title'),
  status:            varchar('status', { length: 100 }),
  clientApproval:    varchar('client_approval', { length: 50 }),
  videoLevel:        varchar('video_level', { length: 50 }),
  caption:           text('caption'),
  publishingStatus:  varchar('publishing_status', { length: 50 }),
  frameioAssetId:    varchar('frameio_asset_id', { length: 100 }),
  vistasocialPostId: varchar('vistasocial_post_id', { length: 100 }),
  assignedAmName:    text('assigned_am_name'),
  editorName:        text('editor_name'),
  clientName:        text('client_name'),
  qualityCheck:      varchar('quality_check', { length: 50 }),
  dateUpdated:       text('date_updated'),
  dueDate:           text('due_date'),
  lastSyncedAt:      timestamp('last_synced_at').defaultNow(),
  dirty:             boolean('dirty').default(false),
});

const BASE = 'https://api.clickup.com/api/v2';
const TERMINAL = ['Posted in Socials', 'Archived', 'Not Posted — Discarded'];

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
    const res = await fetch(`${BASE}/list/${listId}/task?include_closed=true&custom_fields=true&page=${page}`, {
      headers: { Authorization: token },
    });
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
  const results = await Promise.all(lists.map(l => fetchAllTasksFromList(l.id, token)));
  return results.flat();
}

export default async function handler() {
  const token = process.env.CLICKUP_API_TOKEN!;
  const folderId = process.env.CLICKUP_FOLDER_ID!;
  const dbUrl = process.env.DATABASE_URL!;

  const sql = neon(dbUrl);
  const db = drizzle(sql, { schema: { videoCache } });

  const rawTasks = await fetchAllTasksFromFolder(folderId, token);
  const activeTasks = rawTasks.filter((t: any) => !TERMINAL.includes(t.status?.status));

  let synced = 0;
  let skipped = 0;

  for (const task of activeTasks) {
    // Skip tasks with dirty flag (pending local write)
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

    const clientName = clientField && clientIdx !== null ? resolveOptionName(clientField, clientIdx) : null;
    const qualityCheck = qcField && qcIdx !== null ? resolveOptionName(qcField, qcIdx) : null;

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
      editorName:       editorName,
      clientName:       clientName,
      qualityCheck:     qualityCheck,
      dateUpdated:      task.date_updated ?? null,
      dueDate:          dueDate,
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
        editorName:       editorName,
        clientName:       clientName,
        qualityCheck:     qualityCheck,
        dateUpdated:      task.date_updated ?? null,
        dueDate:          dueDate,
        lastSyncedAt:     new Date(),
        dirty:            false,
      },
    });
    synced++;
  }

  console.log(`ClickUp sync complete: ${synced} synced, ${skipped} skipped (dirty)`);
  return new Response(JSON.stringify({ synced, skipped, total: activeTasks.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '*/5 * * * *', // every 5 minutes
};
