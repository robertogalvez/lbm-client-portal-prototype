import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { videoCache, authUsers } from '@/lib/db/schema';
import { sql, eq } from 'drizzle-orm';

const BASE = 'https://api.clickup.com/api/v2';

function resolveOpt(options: any[], idx: number | null): string | null {
  if (idx === null || !options[idx]) return null;
  return options[idx].name ?? null;
}

function resolveOptId(options: any[], idx: number | null): string | null {
  if (idx === null || !options[idx]) return null;
  return options[idx].id ?? null;
}

async function fetchAllTasks(listId: string, token: string) {
  const all: any[] = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${BASE}/list/${listId}/task?include_closed=true&page=${page}`, {
      headers: { Authorization: token },
      cache: 'no-store',
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
  const results = await Promise.all(lists.map((l: any) => fetchAllTasks(l.id, token)));
  return results.flat();
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return runReset();
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return runReset();
}

async function runReset() {
  try {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;
  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });
  if (!listId && !folderId) return NextResponse.json({ error: 'CLICKUP_LIST_ID or CLICKUP_FOLDER_ID not set' }, { status: 500 });

  // 1. Fetch all tasks — prioritize folder to get Quality Control Board with Revision # field
  const rawTasks = folderId
    ? await fetchAllTasksFromFolder(folderId, token)
    : await fetchAllTasks(listId!, token);
  if (rawTasks.length === 0) {
    return NextResponse.json({ error: 'No tasks returned from ClickUp — aborting to avoid data loss' }, { status: 500 });
  }

  // 2. Build option maps once across all tasks
  const fieldOptions: Record<string, any[]> = {};
  for (const t of rawTasks) {
    for (const f of (t.custom_fields ?? []) as any[]) {
      if (!fieldOptions[f.name] && f.type_config?.options?.length) {
        fieldOptions[f.name] = f.type_config.options;
      }
    }
  }

  // 3. Build rows
  let nullClient = 0;
  const rows = rawTasks.map((task: any) => {
    const fields = (task.custom_fields ?? []) as any[];
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

    const opts = (name: string) => fieldOptions[name] ?? [];
    const clientName = resolveOpt(opts('Client Name (AM)'), clientIdx);
    if (!clientName) nullClient++;

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

    let dueDate: string | null = null;
    if (task.due_date) {
      const ms = Number(task.due_date);
      dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
    }

    return {
      clickupTaskId:    task.id,
      title:            task.name,
      status:           task.status?.status ?? null,
      clientId:         resolveOptId(opts('Client Name (AM)'), clientIdx),
      clientName,
      clientApproval:   resolveOpt(opts('CLIENT APPROVAL'), approvalIdx),
      videoLevel:       resolveOpt(opts('Video Level (AM)'), levelIdx),
      caption:          typeof captionField?.value === 'string' ? captionField.value : null,
      publishingStatus: resolveOpt(opts('Publishing Status'), pubIdx),
      frameioAssetId:   typeof frameField?.value === 'string' ? frameField.value : null,
      rawDriveLink:     typeof rawDriveField?.value === 'string' ? rawDriveField.value : null,
      assignedAmName:   amName,
      editorName,
      qualityCheck:     resolveOpt(opts('QUALITY CHECK (Somu)'), qcIdx),
      revisions,
      dateUpdated:      task.date_updated ?? null,
      dueDate,
      lastSyncedAt:     new Date(),
      dirty:            false,
    };
  });

  // 4. Truncate and batch insert in one shot
  await db.execute(sql`TRUNCATE TABLE video_cache`);
  await db.insert(videoCache).values(rows);

  return NextResponse.json({ inserted: rows.length, nullClient, total: rawTasks.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
