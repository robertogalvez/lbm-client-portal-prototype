import type { Config } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

// Inline schema to avoid bundling the full app
const { pgTable, varchar, text, timestamp, uuid, integer, boolean, jsonb } = await import('drizzle-orm/pg-core');

const clients = pgTable('clients', {
  id:                uuid('id').defaultRandom().primaryKey(),
  name:              varchar('name', { length: 255 }).notNull(),
  clickupTaskId:     varchar('clickup_task_id', { length: 100 }).unique().notNull(),
  type:              varchar('type', { length: 20 }),
  showCalendar:      boolean('show_calendar').default(false),
  monthlyQuota:      integer('monthly_quota'),
  frameioProjectId:  varchar('frameio_project_id', { length: 100 }),
  whatsappNumber:    varchar('whatsapp_number', { length: 30 }),
  brandingConfig:    jsonb('branding_config'),
  contactName:       text('contact_name'),
  contactEmail:      text('contact_email'),
  clientStatus:      varchar('client_status', { length: 20 }),
  lastSyncedAt:      timestamp('last_synced_at'),
  createdAt:         timestamp('created_at').defaultNow(),
});

// Portal users are linked to a client by name string (auth_user.client_name),
// so a client rename must cascade to those rows or the link is silently orphaned.
const authUsers = pgTable('auth_user', {
  id:            text('id').primaryKey(),
  clientName:    text('client_name'),
});

const BASE = 'https://api.clickup.com/api/v2';

async function fetchAllTasksFromList(listId: string, token: string) {
  const all: any[] = [];
  let page = 0;
  while (true) {
    const res = await fetch(`${BASE}/list/${listId}/task?include_closed=true&page=${page}`, {
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

function findField(task: any, name: string) {
  return (task.custom_fields ?? []).find((f: any) => f.name === name);
}

export default async function handler() {
  const token = process.env.CLICKUP_API_TOKEN!;
  const listId = process.env.CLICKUP_CLIENTS_LIST_ID;
  const dbUrl = process.env.DATABASE_URL!;

  if (!listId) {
    return new Response(JSON.stringify({ error: 'CLICKUP_CLIENTS_LIST_ID not set' }), { status: 500 });
  }

  const sql = neon(dbUrl);
  const db = drizzle(sql, { schema: { clients, authUsers } });

  const tasks = await fetchAllTasksFromList(listId, token);

  // "Client Status" is a dropdown (index-based value); ClickUp only includes
  // type_config on some task responses, so find it wherever it's present.
  const statusOptions: { id: string; name: string }[] =
    tasks.map(t => findField(t, 'Client Status')?.type_config?.options).find((o: any) => o?.length) ?? [];

  // The client's real name is the "Client Name (AM)" dropdown value — the same
  // field that tags this client's videos — NOT the task title, which is often a
  // casual label (e.g. task "Sebas Legacy" vs. dropdown "Sebastian Velasquez").
  // Matching the video tag is what links the portal to the right content.
  const clientNameOptions: { id: string; name: string }[] =
    tasks.map(t => findField(t, 'Client Name (AM)')?.type_config?.options).find(o => o?.length) ?? [];

  function resolveClientName(task: { name: string }): string {
    const field = findField(task, 'Client Name (AM)');
    const idx = typeof field?.value === 'number' ? field.value : null;
    if (idx === null) return task.name;
    return field?.type_config?.options?.[idx]?.name ?? clientNameOptions[idx]?.name ?? task.name;
  }

  let synced = 0;
  const skipped: string[] = [];

  // The clients table is small — one read up front replaces the two per-task
  // lookups (prior-name capture + legacy row reconciliation) the loop needs.
  const allClients = await db
    .select({ id: clients.id, name: clients.name, clickupTaskId: clients.clickupTaskId })
    .from(clients);
  const clientsByTaskId = new Map(allClients.map(c => [c.clickupTaskId, c]));

  for (const task of tasks) {
    const statusField = findField(task, 'Client Status');
    const statusIdx = typeof statusField?.value === 'number' ? statusField.value : null;
    const clientStatus = statusIdx !== null
      ? statusField?.type_config?.options?.[statusIdx]?.name ?? statusOptions[statusIdx]?.name ?? null
      : null;

    // Tasks with no Client Status set are placeholder/junk entries, not real clients.
    if (!clientStatus) { skipped.push(task.name); continue; }

    const contactNameField  = findField(task, 'Full Name');
    const contactEmailField = findField(task, 'Contact Email Address');
    const phoneField        = findField(task, 'Phone Number');
    const reelsField        = findField(task, 'Reels / mo');
    const ytField           = findField(task, 'YT videos / mo');

    const reels = typeof reelsField?.value === 'number' ? reelsField.value : Number(reelsField?.value ?? 0) || 0;
    const yt    = typeof ytField?.value === 'number' ? ytField.value : Number(ytField?.value ?? 0) || 0;

    const row = {
      name:           resolveClientName(task),
      clickupTaskId:  task.id as string,
      contactName:    typeof contactNameField?.value === 'string' ? contactNameField.value : null,
      contactEmail:   typeof contactEmailField?.value === 'string' ? contactEmailField.value : null,
      whatsappNumber: typeof phoneField?.value === 'string' ? phoneField.value : null,
      clientStatus:   clientStatus.trim(),
      monthlyQuota:   reels + yt,
      lastSyncedAt:   new Date(),
    };

    // Capture the prior name for this task so a rename can cascade to linked users.
    const existing = clientsByTaskId.get(row.clickupTaskId);

    // Reconcile hand-created rows (pre-dating ClickUp sync) onto the real task ID by name match.
    const legacy = allClients.find(
      c => c.name.toLowerCase() === row.name.toLowerCase() && c.clickupTaskId !== row.clickupTaskId,
    );

    if (legacy) {
      await db.update(clients).set(row).where(eq(clients.id, legacy.id));
    } else {
      await db.insert(clients).values(row).onConflictDoUpdate({ target: clients.clickupTaskId, set: row });
    }

    // Keep portal-user links in sync when the ClickUp-owned name changes.
    const prevName = existing?.name ?? legacy?.name;
    if (prevName && prevName !== row.name) {
      await db.update(authUsers).set({ clientName: row.name }).where(eq(authUsers.clientName, prevName));
    }
    synced++;
  }

  console.log(`Client sync complete: ${synced} synced, ${skipped.length} skipped (no Client Status): ${skipped.join(', ')}`);
  return new Response(JSON.stringify({ synced, skipped: skipped.length, skippedNames: skipped, total: tasks.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '*/15 * * * *', // every 15 minutes — client data changes far less often than video status
};
