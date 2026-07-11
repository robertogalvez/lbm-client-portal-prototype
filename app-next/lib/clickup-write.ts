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

export function findField(task: ClickUpTaskLite, name: string): ClickUpFieldLite | undefined {
  return (task.custom_fields ?? []).find(f => f.name === name);
}

// Set a URL / text custom field. Returns false (without throwing) if the field
// isn't present on the task — capture degrades gracefully when the optional
// "Instagram URL" field hasn't been created in ClickUp yet.
export async function setUrlField(task: ClickUpTaskLite, fieldName: string, value: string): Promise<boolean> {
  const field = findField(task, fieldName);
  if (!field) return false;
  await cuRequest(`/task/${task.id}/field/${field.id}`, { method: 'POST', body: JSON.stringify({ value }) });
  return true;
}

// Set a drop-down field to the option matching `optionName` (case-insensitive),
// using the option UUID as the value.
export async function setDropdownByName(task: ClickUpTaskLite, fieldName: string, optionName: string): Promise<boolean> {
  const field = findField(task, fieldName);
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

// Standard field-name constants (see the plan Appendix for the field UUIDs).
export const FIELDS = {
  publishingStatus: 'Publishing Status',
  captions: 'Captions',
  publishDate: 'Publish Date',
  frameLink: 'Updated Frame Link (Editor)',
  clientName: 'Client Name (AM)',
  readyToPublish: 'Ready to Publish?',
  instagramUrl: 'Instagram URL',
} as const;

export const PUBLISHING_STATUS = {
  published: 'Published',
  error: 'Error',
} as const;

export const POSTED_IN_SOCIALS_STATUS = 'Posted in Socials';
