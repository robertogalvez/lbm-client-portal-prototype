// Shared ClickUp v2 write helpers for the publishing pipeline.
//
// ClickUp limits: 100 req/min per token (Business tier). On 429 the response
// carries X-RateLimit-Reset; we do a single bounded retry, then throw so the
// caller can defer. Dropdown values are set by the option's UUID (matching the
// proven Make.com blueprint behavior), resolved live from the task's type_config.

const BASE = 'https://api.clickup.com/api/v2';

export class ClickUpWriteError extends Error {
  status?: number;
  body?: unknown;
  constructor(msg: string, status?: number, body?: unknown) {
    super(msg);
    this.name = 'ClickUpWriteError';
    this.status = status;
    this.body = body;
  }
}

function cuHeaders() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

async function cuRequest<T = unknown>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { ...cuHeaders(), ...(init.headers ?? {}) }, cache: 'no-store' });

  if (res.status === 429 && retry) {
    const reset = Number(res.headers.get('x-ratelimit-reset'));
    const nowSec = Date.now() / 1000;
    const waitMs = Number.isFinite(reset) && reset > nowSec ? Math.min((reset - nowSec) * 1000, 5000) : 1500;
    await new Promise(r => setTimeout(r, waitMs));
    return cuRequest<T>(path, init, false);
  }

  const text = await res.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  if (!res.ok) throw new ClickUpWriteError(`ClickUp ${res.status}: ${path}`, res.status, body);
  return body as T;
}

export interface ClickUpFieldLite {
  id: string;
  name: string;
  value?: unknown;
  type_config?: { options?: { id: string; name: string; orderindex?: number }[] };
}
export interface ClickUpTaskLite {
  id: string;
  name: string;
  status?: { status: string };
  custom_fields?: ClickUpFieldLite[];
}

export async function getTask(taskId: string): Promise<ClickUpTaskLite> {
  return cuRequest<ClickUpTaskLite>(`/task/${taskId}?custom_fields=true`, { method: 'GET' });
}

// A field is resolved by its stable UUID first, falling back to its display
// name. ClickUp field names drift over time (e.g. "Publish Date" →
// "Publish Date (VistaSocial)"); the UUID is stable, so matching on it first
// keeps the pipeline working across renames.
export interface FieldRef { id: string; name: string }

export function findFieldRef(task: ClickUpTaskLite, ref: FieldRef): ClickUpFieldLite | undefined {
  const fields = task.custom_fields ?? [];
  return fields.find(f => f.id === ref.id) ?? fields.find(f => f.name === ref.name);
}

export function findField(task: ClickUpTaskLite, name: string): ClickUpFieldLite | undefined {
  return (task.custom_fields ?? []).find(f => f.name === name);
}

// Set a URL / text custom field. Returns false (without throwing) if the field
// isn't present on the task — capture degrades gracefully when the optional
// "Instagram URL" field hasn't been created in ClickUp yet.
export async function setUrlField(task: ClickUpTaskLite, ref: FieldRef, value: string): Promise<boolean> {
  const field = findFieldRef(task, ref);
  if (!field) return false;
  await cuRequest(`/task/${task.id}/field/${field.id}`, { method: 'POST', body: JSON.stringify({ value }) });
  return true;
}

// Set a drop-down field to the option matching `optionName` (case-insensitive),
// using the option UUID as the value. No-ops (returns false) if the field or
// option is absent.
export async function setDropdownByName(task: ClickUpTaskLite, ref: FieldRef, optionName: string): Promise<boolean> {
  const field = findFieldRef(task, ref);
  const options = field?.type_config?.options ?? [];
  const opt = options.find(o => o.name.toLowerCase() === optionName.toLowerCase());
  if (!field || !opt) return false;
  await cuRequest(`/task/${task.id}/field/${field.id}`, { method: 'POST', body: JSON.stringify({ value: opt.id }) });
  return true;
}

export async function postComment(taskId: string, commentText: string, notifyAll = true): Promise<void> {
  await cuRequest(`/task/${taskId}/comment`, { method: 'POST', body: JSON.stringify({ comment_text: commentText, notify_all: notifyAll }) });
}

export async function setTaskStatus(taskId: string, status: string): Promise<void> {
  await cuRequest(`/task/${taskId}`, { method: 'PUT', body: JSON.stringify({ status }) });
}

// Field references (UUID + current name) verified against the live LBM workspace
// (task 86aj464t5, list "0. Videographer's Backlog"). UUIDs are the source of
// truth; names are the human-readable fallback.
export const FIELD = {
  captions:       { id: '5b210bcd-f8b8-4892-9cc0-7695bb2f1b9b', name: 'Captions' },
  publishDate:    { id: '5b38072f-aac1-4c90-9833-137abf3bae0b', name: 'Publish Date (VistaSocial)' },
  frameLink:      { id: '36e82505-006b-4c42-9a0c-534c957330ed', name: 'Updated Frame Link (Editor)' },
  clientName:     { id: '79ec577a-a9bd-473f-85cf-7f4a2aa17740', name: 'Client Name (AM)' },
  readyToPublish: { id: 'c2e603af-a70b-43c2-b257-fe9a02336336', name: 'Ready to Publish?' },
  instagramUrl:   { id: '55eb3666-a703-47d5-8805-8bdb23fb3d07', name: 'Instagram URL' },
  postedStatus:   { id: '05c724d8-261b-40c6-b736-53869eb5c913', name: 'Posted Status' },
  // Lives on the "Posting Board" list (workspace 90131939077, list
  // 901323443204), not the videographer's-backlog list the other fields above
  // were verified against — tasks are multi-homed into Posting Board once
  // ready to post, so the field travels with the task regardless of which
  // list a given request views it from.
  vistaMediaUrl:  { id: 'db5ae240-38e9-4f36-80e9-9860040facbc', name: 'VistaSocial Media URL' },
} as const satisfies Record<string, FieldRef>;

// DB `publishing_status` cache value (no live ClickUp "Publishing Status" field
// exists on this workspace anymore — publish state is tracked via the task
// status pipeline + the Instagram URL field + this cached string).
export const PUBLISHING_STATUS = {
  published: 'Published',
  error: 'Error',
} as const;

// Native ClickUp task status values for this pipeline (exact strings confirmed
// live from the workspace's `status`/`available_statuses`, which are lowercase
// regardless of how ClickUp's UI capitalizes them for display).
export const TASK_STATUS = {
  readyToBePosted:      'ready to be posted',
  postedInSocials:      'posted in socials',
  // Approved but held for fix checklist items — sits between "for client review"
  // and "ready to be posted". Must exist in every pipeline list before this ships.
  approvedFixesPending: 'approved · fixes pending',
} as const;

// Values of the "Posted Status" custom field. This field is FEEDBACK, written by
// the pipeline (not a trigger): "Do not post" is the one exception — an AM-set
// opt-out meaning the client will post it themselves, which blocks auto-publish.
// "Posting Failed" is set when Vista Social posting fails.
export const POSTED_STATUS = {
  doNotPost: 'Do not post',
  failed: 'Posting Failed',
} as const;

export function normStatus(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ── Checklist helpers ────────────────────────────────────────────────────────

export async function createChecklist(taskId: string, name: string): Promise<{ id: string }> {
  const r = await cuRequest<{ checklist: { id: string } }>(`/task/${taskId}/checklist`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return { id: r.checklist.id };
}

export async function addChecklistItem(checklistId: string, name: string): Promise<{ id: string }> {
  const r = await cuRequest<{ checklist_item: { id: string } }>(`/checklist/${checklistId}/checklist_item`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return { id: r.checklist_item.id };
}

export async function resolveChecklistItem(checklistItemId: string, resolved: boolean): Promise<void> {
  await cuRequest(`/checklist_item/${checklistItemId}`, {
    method: 'PUT',
    body: JSON.stringify({ resolved }),
  });
}

export async function createClientFixesChecklist(
  taskId: string,
  items: string[],
  dateLabel: string,
): Promise<{ checklistId: string; itemIds: string[] }> {
  const { id: checklistId } = await createChecklist(taskId, `Client fixes — ${dateLabel}`);
  const itemIds: string[] = [];
  for (const name of items) {
    const { id } = await addChecklistItem(checklistId, name);
    itemIds.push(id);
  }
  return { checklistId, itemIds };
}
