import type { Config } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq, notInArray, and, sql } from 'drizzle-orm';

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
  deliverableType:   varchar('deliverable_type', { length: 20 }).default('short_form'),
  caption:           text('caption'),
  publishingStatus:  varchar('publishing_status', { length: 50 }),
  frameioAssetId:    varchar('frameio_asset_id', { length: 100 }),
  rawDriveLink:      text('raw_drive_link'),
  vistasocialPostId: varchar('vistasocial_post_id', { length: 100 }),
  instagramUrl:      text('instagram_url'),
  assignedAmName:    text('assigned_am_name'),
  editorName:        text('editor_name'),
  clientName:        text('client_name'),
  qualityCheck:      varchar('quality_check', { length: 50 }),
  captionApproval:   varchar('caption_approval', { length: 50 }),
  isYoutube:         boolean('is_youtube').default(false),
  dateUpdated:       text('date_updated'),
  dueDate:           text('due_date'),
  vistasocialScheduledAt: timestamp('vistasocial_scheduled_at'),
  lastSyncedAt:      timestamp('last_synced_at').defaultNow(),
  dirty:             boolean('dirty').default(false),
});

const BASE = 'https://api.clickup.com/api/v2';
const TERMINAL = ['Posted in Socials', 'Archived', 'Not Posted — Discarded'];
const DELIVERABLE_TYPE_MAP: Record<string, string> = {
  'short-form': 'short_form',
  'short form': 'short_form',
  'youtube': 'youtube',
  'ad': 'ad',
  'ads': 'ad',
};

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
    const res = await fetch(`${BASE}/list/${listId}/task?include_closed=true&page=${page}`, {
      headers: { Authorization: token },
    });
    // Abort rather than break: an error body yields no `tasks`, which would
    // end pagination early and pass a partial list off as the complete one.
    // The stale-row delete below trusts this list to be complete.
    if (!res.ok) {
      throw new Error(`ClickUp list ${listId} page ${page} failed: ${res.status} ${res.statusText}`);
    }
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
  if (!res.ok) {
    throw new Error(`ClickUp folder ${folderId} failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  const lists: any[] = data.lists ?? [];
  const results = await Promise.all(lists.map(l => fetchAllTasksFromList(l.id, token)));
  return results.flat();
}

export default async function handler() {
  const token = process.env.CLICKUP_API_TOKEN!;
  const listId = process.env.CLICKUP_LIST_ID!;
  const dbUrl = process.env.DATABASE_URL!;

  const sql = neon(dbUrl);
  const db = drizzle(sql, { schema: { videoCache } });

  const rawTasks = await fetchAllTasksFromList(listId, token);
  const activeTasks = rawTasks.filter((t: any) => !TERMINAL.includes(t.status?.status));

  // Extract option maps once from whichever task has type_config populated for each field.
  // ClickUp only includes type_config on some tasks in the response, so we can't rely on it per-task.
  const fieldOptions: Record<string, any[]> = {};
  for (const t of rawTasks) {
    for (const f of (t.custom_fields ?? []) as any[]) {
      if (!fieldOptions[f.name] && f.type_config?.options?.length) {
        fieldOptions[f.name] = f.type_config.options;
      }
    }
  }

  function resolveByName(fieldName: string, idx: number | null): string | null {
    if (idx === null) return null;
    return fieldOptions[fieldName]?.[idx]?.name ?? null;
  }

  function resolveIdByName(fieldName: string, idx: number | null): string | null {
    if (idx === null) return null;
    return fieldOptions[fieldName]?.[idx]?.id ?? null;
  }

  // One query up front instead of a per-task dirty check: tasks with a pending
  // local write are skipped so the sync never clobbers them.
  const dirtyRows = await db.select({ id: videoCache.clickupTaskId })
    .from(videoCache)
    .where(eq(videoCache.dirty, true));
  const dirtyIds = new Set(dirtyRows.map(r => r.id));

  let skipped = 0;
  const rows: (typeof videoCache.$inferInsert)[] = [];
  const clientRecordIds = new Set<string>();

  for (const task of activeTasks) {
    if (dirtyIds.has(task.id)) { skipped++; continue; }

    const fields = task.custom_fields ?? [];
    const find = (name: string) => fields.find((f: any) => f.name === name);

    const clientField   = find('Client Name (AM)');
    const levelField    = find('Video Level (AM)');
    const deliverableTypeField = find('Deliverable Type');
    const approvalField = find('CLIENT APPROVAL');
    const pubField      = find('Publishing Status');
    const captionField         = find('Captions');
    const captionApprovalField = find('CAPTION APPROVAL');
    const frameField    = find('Updated Frame Link (Editor)');
    const rawDriveField = find('Raw Drive Link (Videographer)');
    const instagramField = find('Instagram URL');
    const amField       = find('Account Manager (AM)');
    const qcField       = find('QUALITY CHECK (Somu)');
    const publishDateField = find('Publish Date (VistaSocial)');

    const clientIdx   = typeof clientField?.value === 'number' ? clientField.value : null;
    const levelIdx    = typeof levelField?.value === 'number' ? levelField.value : null;
    const deliverableTypeIdx = typeof deliverableTypeField?.value === 'number' ? deliverableTypeField.value : null;
    const approvalIdx        = typeof approvalField?.value === 'number' ? approvalField.value : null;
    const captionApprovalIdx = typeof captionApprovalField?.value === 'number' ? captionApprovalField.value : null;
    const pubIdx      = typeof pubField?.value === 'number' ? pubField.value : null;
    const qcIdx       = typeof qcField?.value === 'number' ? qcField.value : null;

    const amUsers    = amField?.value as { username?: string }[] | undefined;
    const amName     = amUsers?.[0]?.username ?? null;
    const editorName = (task.assignees as { username?: string }[])?.[0]?.username ?? null;
    const isYoutube  = ((task.tags ?? []) as { name?: string }[]).some(tag => tag.name?.toLowerCase() === 'youtube');

    // 'Deliverable Type' is a new ClickUp dropdown (short_form|youtube|ad) —
    // falls back to the isYoutube tag for tasks created before the field
    // existed, so short-form vs YouTube is never misclassified during rollout.
    const deliverableTypeRaw = resolveByName('Deliverable Type', deliverableTypeIdx);
    const deliverableType = deliverableTypeRaw
      ? (DELIVERABLE_TYPE_MAP[deliverableTypeRaw.toLowerCase()] ?? 'short_form')
      : (isYoutube ? 'youtube' : 'short_form');

    let dueDate: string | null = null;
    if (task.due_date) {
      const ms = Number(task.due_date);
      dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
    }

    // "Publish Date (VistaSocial)" is a ClickUp date field — its value is
    // epoch ms. Never populated by this sync before, so resolvePostedAt()
    // always fell back to dateUpdated (last status-change time, not the
    // real go-live date).
    let vistasocialScheduledAt: Date | null = null;
    const pubDateMs = Number(publishDateField?.value);
    if (Number.isFinite(pubDateMs) && pubDateMs > 0) vistasocialScheduledAt = new Date(pubDateMs);

    const clientName   = resolveByName('Client Name (AM)', clientIdx);
    const qualityCheck = resolveByName('QUALITY CHECK (Somu)', qcIdx);

    // The synced list also holds one non-video "Client" record task per
    // client, used only to carry the clickupTaskId/clickupClientOptionId
    // onboarded into the `clients` table. Its title is always exactly the
    // client's own name (e.g. task "Apex" with Client Name (AM) = Apex) —
    // no real video is ever titled that. custom_item_id looked like a
    // cleaner signal but the bulk list endpoint doesn't reliably surface it,
    // so this was silently a no-op; matching on title is what actually found
    // and removed these 17 rows when the bug was first diagnosed. Compared
    // case/whitespace-insensitively — "Project based" vs "Project Based"
    // slipped past an exact match and re-inflated Backlog by one.
    if (clientName && task.name.trim().toLowerCase() === clientName.trim().toLowerCase()) {
      clientRecordIds.add(task.id); continue;
    }

    const row = {
      status:           task.status?.status ?? null,
      clientId:         resolveIdByName('Client Name (AM)', clientIdx),
      clientApproval:   resolveByName('CLIENT APPROVAL', approvalIdx),
      captionApproval:  resolveByName('CAPTION APPROVAL', captionApprovalIdx),
      videoLevel:       resolveByName('Video Level (AM)', levelIdx),
      deliverableType,
      caption:          typeof captionField?.value === 'string' ? captionField.value : null,
      publishingStatus: resolveByName('Publishing Status', pubIdx),
      frameioAssetId:   typeof frameField?.value === 'string' ? frameField.value : null,
      rawDriveLink:     typeof rawDriveField?.value === 'string' ? rawDriveField.value : null,
      instagramUrl:     typeof instagramField?.value === 'string' ? instagramField.value : null,
      assignedAmName:   amName,
      editorName,
      clientName,
      qualityCheck,
      isYoutube,
      dateUpdated:      task.date_updated ?? null,
      dueDate,
      vistasocialScheduledAt,
      lastSyncedAt:     new Date(),
      dirty:            false,
    };

    rows.push({ clickupTaskId: task.id, title: task.name, ...row });
  }

  // Chunked multi-row upserts: one round-trip per ~50 tasks instead of one per
  // task. On conflict every synced column takes the incoming (excluded) value;
  // title is intentionally left alone, matching the previous per-row update set.
  const excluded = (col: string) => sql.raw(`excluded."${col}"`);
  const updateSet = {
    status:           excluded('status'),
    clientId:         excluded('client_id'),
    clientApproval:   excluded('client_approval'),
    captionApproval:  excluded('caption_approval'),
    videoLevel:       excluded('video_level'),
    deliverableType:  excluded('deliverable_type'),
    caption:          excluded('caption'),
    publishingStatus: excluded('publishing_status'),
    frameioAssetId:   excluded('frameio_asset_id'),
    rawDriveLink:     excluded('raw_drive_link'),
    instagramUrl:     excluded('instagram_url'),
    assignedAmName:   excluded('assigned_am_name'),
    editorName:       excluded('editor_name'),
    clientName:       excluded('client_name'),
    qualityCheck:     excluded('quality_check'),
    isYoutube:        excluded('is_youtube'),
    dateUpdated:      excluded('date_updated'),
    dueDate:          excluded('due_date'),
    vistasocialScheduledAt: excluded('vistasocial_scheduled_at'),
    lastSyncedAt:     excluded('last_synced_at'),
    dirty:            excluded('dirty'),
  };

  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await db.insert(videoCache).values(rows.slice(i, i + CHUNK))
      .onConflictDoUpdate({ target: videoCache.clickupTaskId, set: updateSet });
  }
  const synced = rows.length;

  // Delete rows that no longer exist in ClickUp (webhook may have missed
  // deletions) or belong to a per-client record task (see above) — the
  // latter still exist in ClickUp so they'd otherwise never be seen as
  // orphaned, leaving any already-synced phantom row stuck forever.
  const allClickupIds = rawTasks
    .map((t: any) => t.id as string)
    .filter(id => !clientRecordIds.has(id));
  let deleted = 0;
  if (allClickupIds.length > 0) {
    const result = await db.delete(videoCache)
      .where(and(notInArray(videoCache.clickupTaskId, allClickupIds), eq(videoCache.dirty, false)));
    deleted = result.rowCount ?? 0;
  }

  console.log(`ClickUp sync complete: ${synced} synced, ${skipped} skipped (dirty), ${clientRecordIds.size} client-record tasks excluded, ${deleted} deleted (orphans)`);
  return new Response(JSON.stringify({ synced, skipped, deleted, total: activeTasks.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '*/5 * * * *', // every 5 minutes
};
