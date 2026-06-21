import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export const maxDuration = 60;

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

  try {
    const rawTasks = await fetchAllTasksFromList(listId, token);

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

    // Build all rows
    const rows = rawTasks.map((task: any) => {
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
        assignedAmName:   amName,
        editorName,
        qualityCheck:     resolveOpt('QUALITY CHECK (Somu)', qcIdx),
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
            assignedAmName:   sql`excluded.assigned_am_name`,
            editorName:       sql`excluded.editor_name`,
            qualityCheck:     sql`excluded.quality_check`,
            dateUpdated:      sql`excluded.date_updated`,
            dueDate:          sql`excluded.due_date`,
            lastSyncedAt:     sql`excluded.last_synced_at`,
          },
        });
    }

    return NextResponse.json({ synced: rows.length, total: rawTasks.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
