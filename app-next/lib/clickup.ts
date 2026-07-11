const BASE = 'https://api.clickup.com/api/v2';

function headers() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${path}`);
  return res.json();
}

export function resolveOptionId(field: ClickUpField, valueIndex: number): string | null {
  const options: { id: string; name: string }[] = field?.type_config?.options ?? [];
  return options[valueIndex]?.id ?? null;
}

export function resolveOptionName(field: ClickUpField, valueIndex: number): string | null {
  const options: { id: string; name: string }[] = field?.type_config?.options ?? [];
  return options[valueIndex]?.name ?? null;
}

export interface ClickUpField {
  id: string;
  name: string;
  type: string;
  value: unknown;
  type_config?: { options?: { id: string; name: string; color?: string }[] };
}

export interface ClickUpTask {
  id: string;
  name: string;
  status: { status: string; color: string };
  custom_fields: ClickUpField[];
  assignees: { id: string; username: string }[];
  tags: { name: string }[];
  date_updated: string;
  due_date: string | null;
}

export interface MappedTask {
  clickupTaskId: string;
  title: string;
  status: string;
  clientOptionId: string | null;
  clientName: string | null;
  videoLevel: string | null;
  clientApproval: string | null;
  captionApproval: string | null;
  publishingStatus: string | null;
  qualityCheck: string | null;
  caption: string | null;
  frameLink: string | null;
  rawDriveLink: string | null;
  assignedAmName: string | null;
  editorName: string | null;
  isYoutube: boolean;
  dateUpdated: string;
  dueDate: string | null;
}

function findField(task: ClickUpTask, name: string): ClickUpField | undefined {
  return task.custom_fields.find(f => f.name === name);
}

export function mapTask(task: ClickUpTask, sharedOptions: Record<string, { id: string; name: string }[]> = {}): MappedTask {
  const clientField   = findField(task, 'Client Name (AM)');
  const levelField    = findField(task, 'Video Level (AM)');
  const approvalField = findField(task, 'CLIENT APPROVAL');
  const pubField      = findField(task, 'Publishing Status');
  const captionField        = findField(task, 'Captions');
  const captionApprovalField = findField(task, 'CAPTION APPROVAL');
  const frameLinkField = findField(task, 'Updated Frame Link (Editor)');
  const rawDriveLinkField = findField(task, 'Raw Drive Link (Videographer)');
  const amField       = findField(task, 'Account Manager (AM)');
  const qcField       = findField(task, 'QUALITY CHECK (Somu)');

  const clientIdx   = typeof clientField?.value === 'number' ? clientField.value : null;
  const levelIdx    = typeof levelField?.value === 'number' ? levelField.value : null;
  const approvalIdx        = typeof approvalField?.value === 'number' ? approvalField.value : null;
  const captionApprovalIdx = typeof captionApprovalField?.value === 'number' ? captionApprovalField.value : null;
  const pubIdx      = typeof pubField?.value === 'number' ? pubField.value : null;
  const qcIdx       = typeof qcField?.value === 'number' ? qcField.value : null;

  const amUsers   = amField?.value as { username?: string }[] | undefined;
  const amName    = amUsers?.[0]?.username ?? null;
  const editorName = task.assignees?.[0]?.username ?? null;
  const isYoutube  = (task.tags ?? []).some(tag => tag.name?.toLowerCase() === 'youtube');

  let dueDate: string | null = null;
  if (task.due_date) {
    const ms = Number(task.due_date);
    dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
  }

  const resolve = (field: ClickUpField | undefined, idx: number | null): string | null => {
    if (!field || idx === null) return null;
    return field.type_config?.options?.[idx]?.name ?? sharedOptions[field.name]?.[idx]?.name ?? null;
  };
  const resolveId = (field: ClickUpField | undefined, idx: number | null): string | null => {
    if (!field || idx === null) return null;
    return field.type_config?.options?.[idx]?.id ?? sharedOptions[field.name]?.[idx]?.id ?? null;
  };

  return {
    clickupTaskId:    task.id,
    title:            task.name,
    status:           task.status.status,
    clientOptionId:   resolveId(clientField, clientIdx),
    clientName:       resolve(clientField, clientIdx),
    videoLevel:       resolve(levelField, levelIdx),
    clientApproval:   resolve(approvalField, approvalIdx),
    captionApproval:  resolve(captionApprovalField, captionApprovalIdx),
    publishingStatus: resolve(pubField, pubIdx),
    qualityCheck:     resolve(qcField, qcIdx),
    caption:          typeof captionField?.value === 'string' ? captionField.value : null,
    frameLink:        typeof frameLinkField?.value === 'string' ? frameLinkField.value : null,
    rawDriveLink:     typeof rawDriveLinkField?.value === 'string' ? rawDriveLinkField.value : null,
    assignedAmName:   amName,
    editorName,
    isYoutube,
    dateUpdated:      task.date_updated,
    dueDate,
  };
}

// Only truly dead tasks are hidden by the archived toggle.
// "posted in socials" stays visible always so the pipeline funnel shows the full picture.
const HIDDEN_STATUSES = ['archived', 'not posted - discarded'];

async function fetchRawTasks(listId: string): Promise<ClickUpTask[]> {
  const all: ClickUpTask[] = [];
  let page = 0;
  while (true) {
    const data = await get(`/list/${listId}/task?include_closed=true&page=${page}`);
    const tasks: ClickUpTask[] = data.tasks ?? [];
    all.push(...tasks);
    if (tasks.length < 100) break;
    page++;
  }
  return all;
}

export async function getTasksFromList(listId: string, includeArchived = false): Promise<MappedTask[]> {
  const all = await fetchRawTasks(listId);

  // Build shared options map — ClickUp only includes type_config on some tasks per response
  const fieldOptions: Record<string, { id: string; name: string }[]> = {};
  for (const t of all) {
    for (const f of t.custom_fields) {
      if (!fieldOptions[f.name] && f.type_config?.options?.length) {
        fieldOptions[f.name] = f.type_config.options as { id: string; name: string }[];
      }
    }
  }

  return all
    .filter(t => includeArchived ? true : !HIDDEN_STATUSES.includes(t.status.status.toLowerCase()))
    .map(t => mapTask(t, fieldOptions));
}

export async function getTasksFromFolder(folderId: string, includeArchived = false): Promise<MappedTask[]> {
  const data = await get(`/folder/${folderId}/list`);
  const lists: { id: string }[] = data.lists ?? [];

  const masterListId = process.env.CLICKUP_LIST_ID;
  const ordered = masterListId
    ? [{ id: masterListId }, ...lists.filter(l => l.id !== masterListId)]
    : lists;

  const results = await Promise.all(ordered.map(l => getTasksFromList(l.id, includeArchived)));
  const seen = new Set<string>();
  return results.flat().filter(t => {
    if (seen.has(t.clickupTaskId)) return false;
    seen.add(t.clickupTaskId);
    return true;
  });
}

export interface ClientQuota {
  name: string;
  reelsPerMonth: number;
  ytPerMonth: number;
}

export interface MasterClientRecord {
  clickupTaskId: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  whatsappNumber: string | null;
  clientStatus: string;
  monthlyQuota: number;
}

// Build the shared option list for a dropdown field — ClickUp only includes
// type_config on some task responses, not all, so scan until one has it.
function buildFieldOptions(tasks: ClickUpTask[], fieldName: string): { id: string; name: string }[] {
  for (const t of tasks) {
    const options = findField(t, fieldName)?.type_config?.options;
    if (options?.length) return options;
  }
  return [];
}

// The link between a Master Clients List entry and its videos is the "Client
// Name (AM)" dropdown value on that task — NOT the task's own title, which is
// often a different, more casual label (e.g. task "Sebas Legacy" vs. dropdown
// value "Sebastian Velasquez", which is what tags that client's videos).
function resolveClientNameAM(task: ClickUpTask, sharedOptions: { id: string; name: string }[]): string | null {
  const field = findField(task, 'Client Name (AM)');
  const idx = typeof field?.value === 'number' ? field.value : null;
  if (idx === null) return null;
  return field?.type_config?.options?.[idx]?.name ?? sharedOptions[idx]?.name ?? null;
}

// Tasks in the Master Clients List with no "Client Status" set are placeholder/
// junk entries (e.g. stray planning notes), not real clients — skip them.
export async function getMasterClientRecords(): Promise<{ records: MasterClientRecord[]; skipped: string[] }> {
  const listId = process.env.CLICKUP_CLIENTS_LIST_ID;
  if (!listId) return { records: [], skipped: [] };

  const tasks = await fetchRawTasks(listId);

  const statusOptions = buildFieldOptions(tasks, 'Client Status');
  const clientNameOptions = buildFieldOptions(tasks, 'Client Name (AM)');

  const records: MasterClientRecord[] = [];
  const skipped: string[] = [];

  for (const t of tasks) {
    const statusField = findField(t, 'Client Status');
    const statusIdx = typeof statusField?.value === 'number' ? statusField.value : null;
    const clientStatus = statusIdx !== null
      ? statusField?.type_config?.options?.[statusIdx]?.name ?? statusOptions[statusIdx]?.name ?? null
      : null;

    if (!clientStatus) { skipped.push(t.name); continue; }

    const contactNameField  = findField(t, 'Full Name');
    const contactEmailField = findField(t, 'Contact Email Address');
    const phoneField        = findField(t, 'Phone Number');
    const reelsField        = findField(t, 'Reels / mo');
    const ytField           = findField(t, 'YT videos / mo');

    const reels = typeof reelsField?.value === 'number' ? reelsField.value : Number(reelsField?.value ?? 0) || 0;
    const yt    = typeof ytField?.value === 'number' ? ytField.value : Number(ytField?.value ?? 0) || 0;

    records.push({
      clickupTaskId:  t.id,
      name:           resolveClientNameAM(t, clientNameOptions) ?? t.name,
      contactName:    typeof contactNameField?.value === 'string' ? contactNameField.value : null,
      contactEmail:   typeof contactEmailField?.value === 'string' ? contactEmailField.value : null,
      whatsappNumber: typeof phoneField?.value === 'string' ? phoneField.value : null,
      clientStatus:   clientStatus.trim(),
      monthlyQuota:   reels + yt,
    });
  }

  return { records, skipped };
}

export async function getClientQuotas(): Promise<ClientQuota[]> {
  const listId = process.env.CLICKUP_CLIENTS_LIST_ID;
  if (!listId) return [];

  const tasks = await fetchRawTasks(listId);
  const clientNameOptions = buildFieldOptions(tasks, 'Client Name (AM)');

  return tasks.map(t => {
    const reels = findField(t, 'Reels / mo');
    const yt    = findField(t, 'YT videos / mo');
    const reelsCount = typeof reels?.value === 'number' ? reels.value : Number(reels?.value ?? 0) || 0;
    const ytCount    = typeof yt?.value === 'number' ? yt.value : Number(yt?.value ?? 0) || 0;
    return { name: resolveClientNameAM(t, clientNameOptions) ?? t.name, reelsPerMonth: reelsCount, ytPerMonth: ytCount };
  });
}

export async function getActiveTasks(includeArchived = false): Promise<MappedTask[]> {
  const folderId = process.env.CLICKUP_FOLDER_ID;
  const listId = process.env.CLICKUP_LIST_ID;
  if (folderId) return getTasksFromFolder(folderId, includeArchived);
  if (listId) return getTasksFromList(listId, includeArchived);
  throw new Error('Set CLICKUP_FOLDER_ID or CLICKUP_LIST_ID');
}

export function isConfigured(): boolean {
  return !!(
    process.env.CLICKUP_API_TOKEN &&
    (process.env.CLICKUP_FOLDER_ID || process.env.CLICKUP_LIST_ID || process.env.CLICKUP_APPROVAL_LIST_ID)
  );
}
