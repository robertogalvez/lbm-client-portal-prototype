const BASE = 'https://api.clickup.com/api/v2';

function headers() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(), next: { revalidate: 300 } });
  if (!res.ok) throw new Error(`ClickUp ${res.status}: ${path}`);
  return res.json();
}

// The dropdown `value` is an integer INDEX into type_config.options — not the option id.
// This resolves the index to the stable UUID so we never store the index or the name.
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
  publishingStatus: string | null;
  qualityCheck: string | null;
  caption: string | null;
  assignedAmName: string | null;
  editorName: string | null;
  dateUpdated: string;
  dueDate: string | null;
}

function findField(task: ClickUpTask, name: string): ClickUpField | undefined {
  return task.custom_fields.find(f => f.name === name);
}

export function mapTask(task: ClickUpTask): MappedTask {
  const clientField   = findField(task, 'Client Name (AM)');
  const levelField    = findField(task, 'Video Level (AM)');
  const approvalField = findField(task, 'CLIENT APPROVAL');
  const pubField      = findField(task, 'Publishing Status');
  const captionField  = findField(task, 'Captions');
  const amField       = findField(task, 'Account Manager (AM)');
  const qcField       = findField(task, 'QUALITY CHECK (Somu)');

  const clientIdx   = typeof clientField?.value === 'number' ? clientField.value : null;
  const levelIdx    = typeof levelField?.value === 'number' ? levelField.value : null;
  const approvalIdx = typeof approvalField?.value === 'number' ? approvalField.value : null;
  const pubIdx      = typeof pubField?.value === 'number' ? pubField.value : null;
  const qcIdx       = typeof qcField?.value === 'number' ? qcField.value : null;

  const amUsers   = amField?.value as { username?: string }[] | undefined;
  const amName    = amUsers?.[0]?.username ?? null;
  const editorName = task.assignees?.[0]?.username ?? null;

  // due_date is ms timestamp string or ISO string
  let dueDate: string | null = null;
  if (task.due_date) {
    const ms = Number(task.due_date);
    dueDate = isNaN(ms) ? task.due_date : new Date(ms).toISOString();
  }

  return {
    clickupTaskId:    task.id,
    title:            task.name,
    status:           task.status.status,
    clientOptionId:   clientField && clientIdx !== null ? resolveOptionId(clientField, clientIdx) : null,
    clientName:       clientField && clientIdx !== null ? resolveOptionName(clientField, clientIdx) : null,
    videoLevel:       levelField && levelIdx !== null ? resolveOptionName(levelField, levelIdx) : null,
    clientApproval:   approvalField && approvalIdx !== null ? resolveOptionName(approvalField, approvalIdx) : null,
    publishingStatus: pubField && pubIdx !== null ? resolveOptionName(pubField, pubIdx) : null,
    qualityCheck:     qcField && qcIdx !== null ? resolveOptionName(qcField, qcIdx) : null,
    caption:          typeof captionField?.value === 'string' ? captionField.value : null,
    assignedAmName:   amName,
    editorName,
    dateUpdated:      task.date_updated,
    dueDate,
  };
}

const TERMINAL = ['posted in socials', 'archived', 'not posted — discarded'];

export async function getTasksFromList(listId: string, includeArchived = false): Promise<MappedTask[]> {
  const all: ClickUpTask[] = [];
  let page = 0;
  while (true) {
    const data = await get(`/list/${listId}/task?include_closed=true&page=${page}`);
    const tasks: ClickUpTask[] = data.tasks ?? [];
    all.push(...tasks);
    if (tasks.length < 100) break;
    page++;
  }
  return all
    .filter(t => includeArchived ? true : !TERMINAL.includes(t.status.status.toLowerCase()))
    .map(mapTask);
}

export async function getTasksFromFolder(folderId: string, includeArchived = false): Promise<MappedTask[]> {
  const data = await get(`/folder/${folderId}/list`);
  const lists: { id: string }[] = data.lists ?? [];

  // Fetch master list first so its status is authoritative when deduplicating
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
