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
  caption: string | null;
  assignedAmName: string | null;
  dateUpdated: string;
}

function findField(task: ClickUpTask, name: string): ClickUpField | undefined {
  return task.custom_fields.find(f => f.name === name);
}

export function mapTask(task: ClickUpTask): MappedTask {
  const clientField    = findField(task, 'Client Name (AM)');
  const levelField     = findField(task, 'Video Level (AM)');
  const approvalField  = findField(task, 'CLIENT APPROVAL');
  const pubField       = findField(task, 'Publishing Status');
  const captionField   = findField(task, 'Captions');
  const amField        = findField(task, 'Account Manager (AM)');

  const clientIdx  = typeof clientField?.value === 'number' ? clientField.value : null;
  const levelIdx   = typeof levelField?.value === 'number' ? levelField.value : null;
  const approvalIdx = typeof approvalField?.value === 'number' ? approvalField.value : null;
  const pubIdx     = typeof pubField?.value === 'number' ? pubField.value : null;

  const amUsers = amField?.value as { username?: string }[] | undefined;
  const amName  = amUsers?.[0]?.username ?? null;

  return {
    clickupTaskId:   task.id,
    title:           task.name,
    status:          task.status.status,
    clientOptionId:  clientField && clientIdx !== null ? resolveOptionId(clientField, clientIdx) : null,
    clientName:      clientField && clientIdx !== null ? resolveOptionName(clientField, clientIdx) : null,
    videoLevel:      levelField && levelIdx !== null ? resolveOptionName(levelField, levelIdx) : null,
    clientApproval:  approvalField && approvalIdx !== null ? resolveOptionName(approvalField, approvalIdx) : null,
    publishingStatus: pubField && pubIdx !== null ? resolveOptionName(pubField, pubIdx) : null,
    caption:         typeof captionField?.value === 'string' ? captionField.value : null,
    assignedAmName:  amName,
    dateUpdated:     task.date_updated,
  };
}

export async function getActiveTasks(listId: string): Promise<MappedTask[]> {
  // Exclude terminal statuses to keep the result focused on active work
  const TERMINAL = ['Posted in Socials', 'Archived', 'Not Posted — Discarded'];
  const data = await get(`/list/${listId}/task?subtasks=true&include_closed=false&page=0`);
  const tasks: ClickUpTask[] = data.tasks ?? [];
  return tasks
    .filter(t => !TERMINAL.includes(t.status.status))
    .map(mapTask);
}

export function isConfigured(): boolean {
  return !!(process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_LIST_ID);
}
