import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { videoCache, authUsers } from '@/lib/db/schema';
import { sql, notInArray, and, eq } from 'drizzle-orm';

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

async function fetchAllTasksFromFolder(folderId: string, token: string) {
  const res = await fetch(`${BASE}/folder/${folderId}/list`, { headers: { Authorization: token } });
  const data = await res.json();
  const lists: any[] = data.lists ?? [];
  const results = await Promise.all(lists.map((l: any) => fetchAllTasksFromList(l.id, token)));
  return results.flat();
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  const masterListId = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;

  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });
  if (!masterListId && !folderId) return NextResponse.json({ error: 'No ClickUp list/folder configured' }, { status: 500 });

  try {
    // Prioritize folder to get tasks from all lists (Quality Control Board has Revision # field)
    const rawTasks = folderId
      ? await fetchAllTasksFromFolder(folderId, token)
      : await fetchAllTasksFromList(masterListId!, token);

    // Build shared options map once — ClickUp only includes type_config on some tasks
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

    // Merge tasks from multiple lists — prefer non-null field values
    // (e.g., Revision # field only exists on Quality Control Board instance)
    const taskMap = new Map<string, any>();
    let tasksWithRevisionField = 0;
    let tasksWithRevisionValue = 0;

    for (const task of rawTasks) {
      const hasRevField = (task.custom_fields ?? []).some((f: any) => f.name === 'Revision #');
      if (hasRevField) {
        const revField = (task.custom_fields ?? []).find((f: any) => f.name === 'Revision #');
        if (revField?.value !== null && revField?.value !== undefined) {
          tasksWithRevisionValue++;
        }
        tasksWithRevisionField++;
      }

      const existing = taskMap.get(task.id);
      if (!existing) {
        taskMap.set(task.id, task);
      } else {
        // Merge custom fields: collect all fields from both instances
        const mergedFields = [...(existing.custom_fields ?? [])];
        const existingFieldNames = new Set(mergedFields.map((f: any) => f.name));
        for (const f of task.custom_fields ?? []) {
          if (!existingFieldNames.has(f.name)) {
            mergedFields.push(f);
          } else {
            // Replace with non-null value from task
            const idx = mergedFields.findIndex((mf: any) => mf.name === f.name);
            if (f.value !== null && f.value !== undefined) {
              mergedFields[idx] = f;
            }
          }
        }
        taskMap.set(task.id, { ...existing, custom_fields: mergedFields });
      }
    }
    const mergedTasks = Array.from(taskMap.values());
    console.log(`[SYNC] Raw tasks: ${rawTasks.length}, Merged tasks: ${mergedTasks.length}, With Revision field: ${tasksWithRevisionField}, With Revision value: ${tasksWithRevisionValue}`);

    // Build all rows
    let tasksWithRevisions = 0;
    let tasksWithoutRevisionField = 0;
    let revisionFieldExamples: any[] = [];

    const rows = mergedTasks.map((task: any) => {
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

      let revisions: number | null = null;
      if (typeof revisionsField?.value === 'number') {
        revisions = revisionsField.value;
      } else if (typeof revisionsField?.value === 'string') {
        const parsed = parseInt(revisionsField.value, 10);
        revisions = isNaN(parsed) ? null : parsed;
      }

      if (revisionsField) {
        if (revisions !== null) tasksWithRevisions++;
        if (revisionFieldExamples.length < 5) {
          revisionFieldExamples.push({ taskId: task.id, type: typeof revisionsField.value, value: revisionsField.value, parsed: revisions });
        }
      } else {
        tasksWithoutRevisionField++;
      }

      let dueDate: string | null = null;
      if (task.due_date) {
        const ms = Number(task.due_date);
        dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
      }

      return {
        clickupTaskId:    task.id,
        title:            task.name,
        status:           task.status?.status ?? null,
        clientId:         resolveOptId('Client Name (AM)', clientIdx),
        clientName:       resolveOpt('Client Name (AM)', clientIdx),
        clientApproval:   resolveOpt('CLIENT APPROVAL', approvalIdx),
        videoLevel:       resolveOpt('Video Level (AM)', levelIdx),
        caption:          typeof captionField?.value === 'string' ? captionField.value : null,
        publishingStatus: resolveOpt('Publishing Status', pubIdx),
        frameioAssetId:   typeof frameField?.value === 'string' ? frameField.value : null,
        rawDriveLink:     typeof rawDriveField?.value === 'string' ? rawDriveField.value : null,
        assignedAmName:   amName,
        editorName,
        qualityCheck:     resolveOpt('QUALITY CHECK (Somu)', qcIdx),
        revisions,
        dateUpdated:      task.date_updated ?? null,
        dueDate,
        lastSyncedAt:     new Date(),
        dirty:            false,
      };
    });

    // Upsert in chunks of 100 to stay well under query size limits
    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await db.insert(videoCache)
        .values(rows.slice(i, i + CHUNK))
        .onConflictDoUpdate({
          target: videoCache.clickupTaskId,
          set: {
            title:            sql`excluded.title`,
            status:           sql`excluded.status`,
            clientId:         sql`excluded.client_id`,
            clientName:       sql`excluded.client_name`,
            clientApproval:   sql`excluded.client_approval`,
            videoLevel:       sql`excluded.video_level`,
            caption:          sql`excluded.caption`,
            publishingStatus: sql`excluded.publishing_status`,
            frameioAssetId:   sql`excluded.frameio_asset_id`,
            rawDriveLink:     sql`excluded.raw_drive_link`,
            assignedAmName:   sql`excluded.assigned_am_name`,
            editorName:       sql`excluded.editor_name`,
            qualityCheck:     sql`excluded.quality_check`,
            revisions:        sql`excluded.revisions`,
            dateUpdated:      sql`excluded.date_updated`,
            dueDate:          sql`excluded.due_date`,
            lastSyncedAt:     sql`excluded.last_synced_at`,
          },
        });
    }

    // Delete rows that no longer exist in ClickUp (webhook may have missed deletions)
    const clickupIds = mergedTasks.map((t: any) => t.id as string);
    let deleted = 0;
    if (clickupIds.length > 0) {
      const result = await db.delete(videoCache)
        .where(and(notInArray(videoCache.clickupTaskId, clickupIds), eq(videoCache.dirty, false)));
      deleted = result.rowCount ?? 0;
    }

    return NextResponse.json({
      synced: rows.length,
      total: rawTasks.length,
      deleted,
      debug: {
        rawTasksCount: rawTasks.length,
        mergedTasksCount: mergedTasks.length,
        tasksWithRevisionFieldInRaw: tasksWithRevisionField,
        tasksWithRevisionValueInRaw: tasksWithRevisionValue,
        tasksWithRevisionsAfterParsing: tasksWithRevisions,
        tasksWithoutRevisionField,
        revisionFieldExamples,
      },
    });
  } catch (e) {
    const msg   = e instanceof Error ? e.message : String(e);
    const cause = e instanceof Error ? String((e as any).cause ?? '') : '';
    return NextResponse.json({ error: msg, cause }, { status: 500 });
  }
}
