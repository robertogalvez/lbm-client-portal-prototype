// Native Vista Social API client — replaces the Make.com "vista-social" modules.
//
// ⚠️ Vista Social's REST reference is access-gated, so the exact base URL, paths,
// and response field names below are best-effort and MUST be confirmed against
// apidocs.vistasocial.com (or the live Make module output) before going live.
// Everything API-shape-specific is isolated in this file on purpose — if a path
// or field name is wrong, this is the only place to fix it.
//
// Constraints that shape this client (verified from Vista Social docs):
//  - Auth: API key (Settings → Integrations) or OAuth2. We use a bearer token.
//  - The account must be provisioned for API access ("API add-on").
//  - Abuse policy: exceeding the rate limit >10 times in an hour DEACTIVATES the
//    key. So we never tight-loop: on 429 we do a single short retry, then throw
//    RateLimitError and let the caller defer to the next scheduled run.
//  - schedule/create returns post ids (one per profile/network); the live
//    Instagram permalink does NOT exist yet and is fetched later via getPost.

// Confirmed live: dev.vistasocial.com does not resolve/connect from server-side
// callers (fetch-level failure, no HTTP response) — the real API host is
// vistasocial.com. No IP allowlisting required.
const BASE = (process.env.VISTASOCIAL_API_BASE || 'https://vistasocial.com/api/integration').replace(/\/$/, '');

export class RateLimitError extends Error {
  constructor(msg = 'Vista Social rate limit hit') { super(msg); this.name = 'RateLimitError'; }
}

export class VistaSocialError extends Error {
  status?: number;
  body?: unknown;
  constructor(msg: string, status?: number, body?: unknown) {
    super(msg);
    this.name = 'VistaSocialError';
    this.status = status;
    this.body = body;
  }
}

export function isConfigured(): boolean {
  return !!process.env.VISTASOCIAL_API_TOKEN;
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.VISTASOCIAL_API_TOKEN ?? ''}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// Single, conservative retry on 429. We deliberately do NOT loop — Vista Social
// deactivates keys that repeatedly hit the limit.
async function request<T = unknown>(
  path: string,
  init: RequestInit = {},
  { retryOn429 = true }: { retryOn429?: boolean } = {},
): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { ...init, headers: { ...headers(), ...(init.headers ?? {}) }, cache: 'no-store' });

  if (res.status === 429) {
    if (retryOn429) {
      await new Promise(r => setTimeout(r, 2000));
      return request<T>(path, init, { retryOn429: false });
    }
    throw new RateLimitError();
  }

  const text = await res.text();
  let body: unknown = undefined;
  try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }

  if (!res.ok) {
    const bodyStr = (typeof body === 'string' ? body : JSON.stringify(body)).slice(0, 500);
    throw new VistaSocialError(`Vista Social ${res.status}: ${path} — ${bodyStr}`, res.status, body);
  }
  return body as T;
}

export interface SchedulePostInput {
  profileIds: string[];
  caption: string;
  publishAtMs: number;        // epoch ms (from ClickUp Publish Date)
  mediaUrl: string;           // remote URL — Vista Social ingests it directly
  instagramPublishAs?: 'REELS' | 'STORY' | 'FEED';
  publishNow?: boolean;       // send publish_at: "now" (immediate) — for testing
}

export interface SchedulePostResult {
  ids: string[];              // Vista Social post id(s)
  raw: unknown;
}

// ── Create a post ────────────────────────────────────────────────────────────
// POST /posts per the Vista Social integration API:
//   { message, profile_id: [..], publish_at, media_url: [..] }
// publish_at accepts "now", ISO 8601, or a unix timestamp — we send a unix
// timestamp (seconds) so there's no timezone ambiguity. Vista Social fetches the
// media from media_url itself (we never download the file).
export async function schedulePost(input: SchedulePostInput): Promise<SchedulePostResult> {
  const profileIds = input.profileIds.map(p => {
    const n = Number(p);
    return Number.isFinite(n) && p.trim() !== '' ? n : p;
  });

  const payload: Record<string, unknown> = {
    message: input.caption,
    profile_id: profileIds,
    publish_at: input.publishNow ? 'now' : Math.floor(input.publishAtMs / 1000),
    media_url: [input.mediaUrl],
  };
  if (input.instagramPublishAs) payload.instagram_publish_as = input.instagramPublishAs;

  const raw = await request<Record<string, unknown>>('/posts', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const ids = extractIds(raw);
  if (ids.length === 0) throw new VistaSocialError('schedulePost: no post id in response', undefined, raw);
  return { ids, raw };
}

export interface PublishedPost {
  status: string | null;      // e.g. 'scheduled' | 'published' | 'failed'
  permalink: string | null;   // live network permalink, if available
  network: string | null;
  raw: unknown;
}

// ── Get a post by id ─────────────────────────────────────────────────────────
export async function getPost(postId: string): Promise<PublishedPost> {
  const raw = await request<Record<string, unknown>>(`/posts/${encodeURIComponent(postId)}`, { method: 'GET' });
  const post = unwrap(raw);
  return {
    status: pickString(post, ['status', 'state', 'publish_status']),
    permalink: extractPermalink(post),
    network: pickString(post, ['network', 'platform', 'channel']),
    raw,
  };
}

// Convenience: return the Instagram permalink for a post id, or null if not live yet.
// Only returns a permalink that looks like an Instagram URL.
export async function getInstagramPermalink(postId: string): Promise<string | null> {
  const post = await getPost(postId);
  if (post.permalink && isInstagramUrl(post.permalink)) return post.permalink;
  return null;
}

// Terminal states where we should stop polling — the post will never produce a URL.
export function isFailedStatus(status: string | null): boolean {
  if (!status) return false;
  return ['failed', 'error', 'rejected', 'cancelled', 'canceled'].includes(status.toLowerCase());
}

// ── Response-shape helpers (defensive: exact schema unverified) ───────────────

function unwrap(body: unknown): Record<string, unknown> {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (obj.data && typeof obj.data === 'object' && !Array.isArray(obj.data)) return obj.data as Record<string, unknown>;
    return obj;
  }
  return {};
}

function extractId(body: unknown): string | null {
  const obj = unwrap(body);
  const v = obj.id ?? obj.media_id ?? obj.uuid;
  return v != null ? String(v) : null;
}

function extractIds(body: unknown): string[] {
  const obj = unwrap(body);
  const candidates = obj.ids ?? obj.post_ids ?? obj.id ?? obj.posts;
  if (Array.isArray(candidates)) {
    return candidates
      .map(c => (c && typeof c === 'object' ? extractId(c) : c != null ? String(c) : null))
      .filter((x): x is string => !!x);
  }
  if (candidates != null) return [String(candidates)];
  return [];
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v;
  }
  return null;
}

// Look for a permalink across the likely field names, then fall back to scanning
// the object for any instagram.com URL.
function extractPermalink(obj: Record<string, unknown>): string | null {
  const direct = pickString(obj, ['permalink', 'post_url', 'external_url', 'url', 'link', 'live_url']);
  if (direct) return direct;
  const found = deepFindUrl(obj);
  return found;
}

function deepFindUrl(value: unknown, depth = 0): string | null {
  if (depth > 5 || value == null) return null;
  if (typeof value === 'string') return isInstagramUrl(value) ? value : null;
  if (Array.isArray(value)) {
    for (const v of value) { const f = deepFindUrl(v, depth + 1); if (f) return f; }
    return null;
  }
  if (typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) {
      const f = deepFindUrl(v, depth + 1);
      if (f) return f;
    }
  }
  return null;
}

export function isInstagramUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?instagram\.com\//i.test(url.trim());
}
