// Frame.io v4 helper — resolves the final downloadable asset for a video task,
// authenticated via Adobe IMS OAuth 2.0 **User Authentication** ("OAuth Web App"
// credential in Adobe Developer Console → Frame.io API).
//
// Auth model — this is NOT Frame.io's own applications.frame.io OAuth app (that
// issues tokens the v4 API rejects outright, even on account-agnostic endpoints —
// confirmed live) and NOT Adobe IMS Server-to-Server (unavailable on this
// account's plan; Adobe Console only offers "User Authentication" here):
//  - Adobe IMS User Authentication is a confidential-client (Web App) flow: it
//    uses a client_secret, not PKCE. One-time browser authorization
//    (/api/frameio/oauth/start → /callback) yields a refresh token.
//  - Endpoints: authorize at ims-na1.adobelogin.com/ims/authorize, token exchange
//    at .../ims/token/v3. client_id/client_secret go in the request BODY — Adobe
//    IMS explicitly does not support HTTP Basic auth for this.
//  - Access tokens live ~24h; Adobe's documented refresh-token default is ~2
//    weeks (shorter than Frame.io's own knowledge-base claim of 30 days for its
//    legacy OAuth apps — genuinely unconfirmed for this credential type until
//    observed live). REFRESH_TTL_DAYS is env-configurable so the Settings
//    countdown/reminder can be corrected without a code change once the real
//    expiry is seen. If a refresh ever fails early, getAccessToken() immediately
//    surfaces "re-authorize in Settings" regardless of this estimate.
//  - Tokens are persisted in the `oauth_tokens` table (provider = 'frameio').
//  - `getAccessToken()` returns a valid access token, refreshing on demand.
//  - `FRAMEIO_API_TOKEN`, if set, is a manual override (skips OAuth) — handy for a
//    short-lived token during testing.
//
// Asset resolution mirrors the Make.com blueprint:
//   parse version-stack id from "Updated Frame Link (Editor)"
//   → GET version_stacks/{id} → head_version.id
//   → GET files/{id}?include=media_links.high_quality → transcoded + download_url
// (media_links requires the `api-version: experimental` header; download_url can
//  be null until transcoding completes and is signed/time-limited.)

import { db } from '@/lib/db';
import { oauthTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const BASE = 'https://api.frame.io/v4';
const AUTH_URL = process.env.FRAMEIO_OAUTH_AUTH_URL || 'https://ims-na1.adobelogin.com/ims/authorize';
const TOKEN_URL = process.env.FRAMEIO_OAUTH_TOKEN_URL || 'https://ims-na1.adobelogin.com/ims/token/v3';
const SCOPES = process.env.FRAMEIO_OAUTH_SCOPES || 'openid,email,profile,additional_info.roles,offline_access';
const PROVIDER = 'frameio';
const REFRESH_TTL_DAYS = Number(process.env.FRAMEIO_REFRESH_TTL_DAYS) || 14;

export type FrameioStage = 'parse' | 'stack' | 'file' | 'comments' | 'auth';

export class FrameioError extends Error {
  status?: number;
  stage: FrameioStage;
  constructor(msg: string, stage: FrameioStage, status?: number) {
    super(msg);
    this.name = 'FrameioError';
    this.stage = stage;
    this.status = status;
  }
}

export function isConfigured(): boolean {
  if (!process.env.FRAMEIO_ACCOUNT_ID) return false;
  if (process.env.FRAMEIO_API_TOKEN) return true;
  return !!(process.env.FRAMEIO_CLIENT_ID && process.env.FRAMEIO_CLIENT_SECRET);
}

function accountId(): string {
  const id = process.env.FRAMEIO_ACCOUNT_ID;
  if (!id) throw new FrameioError('FRAMEIO_ACCOUNT_ID not set', 'auth');
  return id;
}

function clientId(): string {
  const id = process.env.FRAMEIO_CLIENT_ID;
  if (!id) throw new FrameioError('FRAMEIO_CLIENT_ID not set', 'auth');
  return id;
}

function clientSecret(): string {
  const secret = process.env.FRAMEIO_CLIENT_SECRET;
  if (!secret) throw new FrameioError('FRAMEIO_CLIENT_SECRET not set', 'auth');
  return secret;
}

// ── OAuth: authorization URL + code exchange (used by the bootstrap routes) ────
// Confidential client (client_secret at token exchange) — no PKCE.

export function buildAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri,
    scope: SCOPES.split(/[,\s]+/).filter(Boolean).join(','),
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new FrameioError(
      `Frame.io token request failed (${res.status}): ${data.error ?? ''} ${data.error_description ?? ''}`.trim(),
      'auth',
      res.status,
    );
  }
  return data;
}

// Exchange the authorization code for tokens and persist them. Sets
// refresh_issued_at = now (the reauth clock) and clears any prior alert.
export async function exchangeAndStoreTokens(code: string, redirectUri: string): Promise<void> {
  const data = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const now = new Date();
  const row = {
    provider: PROVIDER,
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(now.getTime() + (data.expires_in ?? 3600) * 1000),
    refreshIssuedAt: now,
    alertedAt: null,
    updatedAt: now,
  };
  await db.insert(oauthTokens).values(row).onConflictDoUpdate({ target: oauthTokens.provider, set: row });
}

// Refresh the access token from the stored refresh token. Keeps refresh_issued_at
// (the reauth-deadline clock runs from the original authorization, not each refresh).
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const data = await postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const now = new Date();
  await db
    .update(oauthTokens)
    .set({
      accessToken: data.access_token!,
      refreshToken: data.refresh_token ?? refreshToken, // persist rotation if any
      expiresAt: new Date(now.getTime() + (data.expires_in ?? 3600) * 1000),
      updatedAt: now,
    })
    .where(eq(oauthTokens.provider, PROVIDER));
  return data.access_token!;
}

async function getAccessToken(): Promise<string> {
  if (process.env.FRAMEIO_API_TOKEN) return process.env.FRAMEIO_API_TOKEN;

  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER)).limit(1);
  if (!row || !row.refreshToken) {
    throw new FrameioError('Frame.io is not connected — authorize it in Settings.', 'auth');
  }
  if (row.accessToken && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) {
    return row.accessToken;
  }
  try {
    return await refreshAccessToken(row.refreshToken);
  } catch {
    throw new FrameioError('Frame.io authorization expired — re-authorize it in Settings.', 'auth');
  }
}

// Connection status for the Settings card + renewal check.
export interface FrameioConnection {
  connected: boolean;
  mode: 'override' | 'oauth' | 'disconnected';
  refreshIssuedAt: Date | null;
  reauthDeadline: Date | null;
  daysUntilReauth: number | null;
  needsReauth: boolean;
  alertedAt: Date | null;
}

export async function getConnectionStatus(): Promise<FrameioConnection> {
  if (process.env.FRAMEIO_API_TOKEN) {
    return { connected: true, mode: 'override', refreshIssuedAt: null, reauthDeadline: null, daysUntilReauth: null, needsReauth: false, alertedAt: null };
  }
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER)).limit(1);
  if (!row || !row.refreshToken || !row.refreshIssuedAt) {
    return { connected: false, mode: 'disconnected', refreshIssuedAt: null, reauthDeadline: null, daysUntilReauth: null, needsReauth: true, alertedAt: null };
  }
  const deadline = new Date(row.refreshIssuedAt.getTime() + REFRESH_TTL_DAYS * 86_400_000);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  return {
    connected: true,
    mode: 'oauth',
    refreshIssuedAt: row.refreshIssuedAt,
    reauthDeadline: deadline,
    daysUntilReauth: daysLeft,
    needsReauth: daysLeft <= 0,
    alertedAt: row.alertedAt,
  };
}

export async function markAlerted(): Promise<void> {
  await db.update(oauthTokens).set({ alertedAt: new Date() }).where(eq(oauthTokens.provider, PROVIDER));
}

// List the accounts the connected token can actually see (GET /v4/accounts —
// account-agnostic, doesn't depend on FRAMEIO_ACCOUNT_ID or any task). Used to
// disambiguate "token is bad" from "token is fine but FRAMEIO_ACCOUNT_ID is
// wrong / not one this user belongs to" without touching any real task/asset.
export async function listAccessibleAccounts(): Promise<{ ids: string[]; names: string[]; matchesConfigured: boolean | null; raw?: unknown; error?: string }> {
  try {
    const raw = await get<{ data?: { id?: string; name?: string }[] }>('/accounts', 'auth');
    const accounts = raw?.data ?? [];
    const ids = accounts.map(a => a.id).filter((x): x is string => !!x);
    const names = accounts.map(a => a.name).filter((x): x is string => !!x);
    const configured = process.env.FRAMEIO_ACCOUNT_ID;
    return { ids, names, matchesConfigured: configured ? ids.includes(configured) : null };
  } catch (e) {
    const err = e as FrameioError;
    return { ids: [], names: [], matchesConfigured: null, error: `${err?.status ?? ''} ${err?.message ?? String(e)}`.trim() };
  }
}

// Read-only auth diagnostics for /api/publish/debug. Never returns secrets.
export async function authDiagnostics(): Promise<Record<string, unknown>> {
  const conn = await getConnectionStatus().catch(e => ({ error: e instanceof Error ? e.message : String(e) }));
  const base = {
    overrideTokenSet: !!process.env.FRAMEIO_API_TOKEN,
    clientIdSet: !!process.env.FRAMEIO_CLIENT_ID,
    clientSecretSet: !!process.env.FRAMEIO_CLIENT_SECRET,
    accountIdSet: !!process.env.FRAMEIO_ACCOUNT_ID,
    scopes: SCOPES,
    tokenUrl: TOKEN_URL,
  };
  try {
    const token = await getAccessToken();
    const accounts = await listAccessibleAccounts();
    return { ...base, connection: conn, tokenObtained: true, tokenPrefix: token.slice(0, 8) + '…', accounts };
  } catch (e) {
    return { ...base, connection: conn, tokenObtained: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Asset resolution ──────────────────────────────────────────────────────────

async function fioHeaders(): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getAccessToken()}`,
    'Content-Type': 'application/json',
    'api-version': 'experimental',
  };
}

async function get<T = Record<string, unknown>>(path: string, stage: FrameioStage): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: await fioHeaders(), cache: 'no-store' });
  if (!res.ok) throw new FrameioError(`Frame.io ${res.status}: ${path}`, stage, res.status);
  return res.json() as Promise<T>;
}

async function post<T = Record<string, unknown>>(path: string, body: unknown, stage: FrameioStage): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: await fioHeaders(),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  if (!res.ok) throw new FrameioError(`Frame.io ${res.status}: ${path}`, stage, res.status);
  return res.json() as Promise<T>;
}

// "https://f.io/abc123?foo=bar" or ".../version_stacks/abc123/" → "abc123"
export function parseVersionStackId(frameLink: string): string | null {
  if (!frameLink) return null;
  const noQuery = frameLink.split('?')[0].replace(/\/+$/, '');
  const last = noQuery.split('/').pop();
  return last && last.length > 0 ? last : null;
}

// Follow a Frame.io short link (f.io/xxx) to its resolved URL. Unauthenticated —
// Frame.io's redirect service doesn't require our OAuth token, and share links
// are typically publicly followable (confirmed: the existing thumbnail-scraping
// code already fetches share URLs anonymously).
export async function resolveShortLink(url: string): Promise<string> {
  try {
    const res = await fetch(url, { redirect: 'follow', cache: 'no-store' });
    return res.url || url;
  } catch {
    return url;
  }
}

// ".../share/{shareId}" or ".../share/{shareId}/view/{assetId}" → both ids.
// The long share-URL form (with /view/{id}) already carries the real asset id
// directly in the path — confirmed live. The short f.io link redirects only to
// the bare share URL (no /view/{id}), so the share must be resolved via the
// Shares API to find its underlying asset.
function parseShareUrl(url: string): { shareId: string | null; viewId: string | null } {
  const clean = url.split('?')[0].replace(/\/+$/, '');
  const m = clean.match(/\/share\/([^/]+)(?:\/view\/([^/]+))?/i);
  if (!m) return { shareId: null, viewId: null };
  return { shareId: m[1] ?? null, viewId: m[2] ?? null };
}

function firstOf<T>(...vals: (T | undefined | null)[]): T | null {
  for (const v of vals) if (v != null) return v;
  return null;
}

function firstChildId(list: unknown): string | null {
  if (!Array.isArray(list) || list.length === 0) return null;
  const first = list[0] as Record<string, unknown>;
  const id = firstOf(first?.id as string | undefined, (first?.asset as { id?: string } | undefined)?.id);
  return id ? String(id) : null;
}

// Live-confirmed: GET /accounts/{id}/shares/{id} returns the share/collection's
// display config — name, theme, layout, etc. — and a `collection_id`, but NOT
// the underlying asset directly. The asset lives one level down, inside that
// collection. ⚠️ The exact "list children of a collection" endpoint path is
// unconfirmed (gated docs) — tries a few plausible REST shapes in order and
// returns whichever responds, plus all attempts for diagnosis.
export async function resolveShareAssetId(shareId: string): Promise<{ assetId: string | null; raw: unknown }> {
  const shareRaw = await get<Record<string, unknown>>(`/accounts/${accountId()}/shares/${shareId}`, 'parse');
  const shareData = ((shareRaw as { data?: unknown })?.data ?? shareRaw) as Record<string, unknown> | undefined;

  // In case some shares DO carry the asset directly (defensive, cheap to keep).
  const direct = firstOf(
    shareData?.asset_id as string | undefined,
    (shareData?.asset as { id?: string } | undefined)?.id,
    firstChildId(shareData?.assets),
    firstChildId(shareData?.items),
  );
  if (direct) return { assetId: String(direct), raw: { share: shareRaw } };

  const collectionId = shareData?.collection_id as string | undefined;
  if (!collectionId) return { assetId: null, raw: { share: shareRaw } };

  const candidatePaths = [
    `/accounts/${accountId()}/collections/${collectionId}/children`,
    `/accounts/${accountId()}/folders/${collectionId}/children`,
    `/accounts/${accountId()}/collections/${collectionId}`,
  ];
  const attempts: Record<string, unknown> = {};
  for (const path of candidatePaths) {
    try {
      const childRaw = await get<Record<string, unknown>>(path, 'parse');
      attempts[path] = childRaw;
      const childData = ((childRaw as { data?: unknown })?.data ?? childRaw) as unknown;
      const childId = firstOf(
        firstChildId(childData),
        firstChildId((childData as Record<string, unknown> | undefined)?.assets),
        firstChildId((childData as Record<string, unknown> | undefined)?.items),
      );
      if (childId) return { assetId: childId, raw: { share: shareRaw, resolvedVia: path, attempts } };
    } catch (e) {
      const err = e as FrameioError;
      attempts[path] = { error: err?.message ?? String(e), status: err?.status };
    }
  }
  return { assetId: null, raw: { share: shareRaw, collectionId, attempts } };
}

export interface FinalAsset {
  ready: boolean;              // transcoded AND has a usable download URL
  status: string | null;
  downloadUrl: string | null;
}

// Resolve a task's Frame link to the concrete v4 file id (the head version of
// its version stack). Handles three link shapes:
//   - full app.frame.io / next.frame.io asset URLs (last path segment is the id)
//   - long share URLs ".../share/{shareId}/view/{assetId}" (proven live)
//   - short f.io links → redirect → bare share URL ".../share/{shareId}"
//     (no /view/{id}) → resolved via the Shares API to find the asset id
// Throws FrameioError when the link can't be parsed or the stack has no head.
export async function resolveFileId(frameLink: string): Promise<string> {
  let link = frameLink;
  if (/^https?:\/\/f\.io\//i.test(link)) {
    link = await resolveShortLink(link);
  }

  let stackId: string | null;
  const { shareId, viewId } = parseShareUrl(link);
  if (viewId) {
    stackId = viewId;
  } else if (shareId) {
    const resolved = await resolveShareAssetId(shareId);
    if (!resolved.assetId) {
      throw new FrameioError(`Could not resolve Frame.io share ${shareId} to an asset`, 'parse');
    }
    stackId = resolved.assetId;
  } else {
    stackId = parseVersionStackId(link);
  }
  if (!stackId) throw new FrameioError('Could not parse a Frame.io asset id from the link', 'parse');

  // The resolved id may be a version-stack id (the proven path) or, when
  // resolved via the Shares API, possibly a direct file id instead — the exact
  // Shares API shape is unconfirmed. Try version_stacks first; on a 404
  // specifically, fall back to treating the id as a direct file id.
  let headVersionId: string | undefined;
  try {
    const stack = await get<{ data?: { head_version?: { id?: string } } }>(
      `/accounts/${accountId()}/version_stacks/${stackId}`,
      'stack',
    );
    headVersionId = stack?.data?.head_version?.id;
  } catch (e) {
    const err = e as FrameioError;
    if (err?.status === 404) {
      headVersionId = stackId; // fall back: treat as a direct file id
    } else {
      throw e;
    }
  }
  if (!headVersionId) throw new FrameioError('Frame.io version stack has no head version', 'stack');
  return headVersionId;
}

// Fetch transcoding status + high-quality download URL for an already-resolved
// v4 file id. Throws FrameioError on hard API failures; returns
// { ready: false } when the asset simply isn't transcoded yet.
export async function getFileMedia(fileId: string): Promise<FinalAsset> {
  const file = await get<{ data?: { status?: string; media_links?: { high_quality?: { download_url?: string | null } } } }>(
    `/accounts/${accountId()}/files/${fileId}?include=media_links.high_quality`,
    'file',
  );
  const status = file?.data?.status ?? null;
  const downloadUrl = file?.data?.media_links?.high_quality?.download_url ?? null;
  const ready = status === 'transcoded' && !!downloadUrl;
  return { ready, status, downloadUrl };
}

// Resolve the final high-quality download URL for the video task's Frame link.
// Throws FrameioError on hard API failures (surfaced as an AM comment upstream);
// returns { ready: false } when the asset simply isn't transcoded yet.
export async function resolveFinalAsset(frameLink: string): Promise<FinalAsset> {
  const fileId = await resolveFileId(frameLink);
  return getFileMedia(fileId);
}

// Preview thumbnail for a task's Frame link — used by the review-grid cards.
// Replaces scraping the share page's og:image (unreliable: that URL isn't
// always loadable in a plain <img> tag, likely signed/session-gated) with
// the v4 API's own media_links.thumbnail field. Never throws — any failure
// (not connected, asset not ready, network) degrades to null so callers can
// fall back to a placeholder, same contract as the scrape it replaces.
export async function getThumbnailUrl(frameLink: string): Promise<string | null> {
  try {
    const fileId = await resolveFileId(frameLink);
    const file = await get<{ data?: { media_links?: { thumbnail?: { url?: string | null; download_url?: string | null } } } }>(
      `/accounts/${accountId()}/files/${fileId}?include=media_links.thumbnail`,
      'file',
    );
    const thumb = file?.data?.media_links?.thumbnail;
    // `.url` has been reported null account-wide on a live Frame.io v4 bug
    // (media_links.*.url returning null while .download_url still resolves —
    // matches the field high_quality already relies on) — try both.
    return thumb?.url ?? thumb?.download_url ?? null;
  } catch {
    return null;
  }
}

// ── Comments ──────────────────────────────────────────────────────────────────

export interface FrameioComment {
  id: string;
  text: string;
  authorName: string | null;
  // Human-readable position in the video ("00:01:23" or a raw timecode string),
  // null for comments not anchored to a moment.
  timestampLabel: string | null;
  createdAt: string | null;
}

function fmtSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// ⚠️ V4 comment field names are gated-docs territory; this mapper is defensive.
// Confirmed-plausible shapes: author under `owner`/`author`/`user`; position as
// a `timecode` string ("HH:MM:SS:FF") or numeric `timestamp`. A numeric
// timestamp is treated as seconds — if live responses turn out to be
// frame-based (as in the legacy v2 API), divide by the file's fps here.
function mapComment(c: Record<string, unknown>): FrameioComment {
  const owner = (c.owner ?? c.author ?? c.user) as Record<string, unknown> | undefined;
  const authorName =
    (owner?.name as string | undefined) ??
    (owner?.display_name as string | undefined) ??
    (owner?.email as string | undefined) ??
    (c.author_name as string | undefined) ??
    null;

  let timestampLabel: string | null = null;
  if (typeof c.timecode === 'string' && c.timecode) {
    timestampLabel = c.timecode;
  } else if (typeof c.timestamp === 'number') {
    timestampLabel = fmtSeconds(c.timestamp);
  }

  return {
    id: String(c.id ?? ''),
    text: typeof c.text === 'string' ? c.text : '',
    authorName,
    timestampLabel,
    createdAt: typeof c.inserted_at === 'string' ? c.inserted_at
      : typeof c.created_at === 'string' ? c.created_at : null,
  };
}

// List all comments on a v4 file (the review feedback clients leave in the
// embedded player). Follows cursor pagination via `links.next` when present.
export async function listComments(fileId: string): Promise<FrameioComment[]> {
  const out: FrameioComment[] = [];
  let path: string | null = `/accounts/${accountId()}/files/${fileId}/comments`;
  let guard = 0;

  while (path && guard++ < 25) {
    const raw: Record<string, unknown> = await get<Record<string, unknown>>(path, 'comments');
    const data = Array.isArray(raw?.data) ? (raw.data as Record<string, unknown>[]) : [];
    for (const c of data) {
      const mapped = mapComment(c);
      if (mapped.id) out.push(mapped);
    }

    const next = (raw?.links as { next?: string } | undefined)?.next ?? null;
    if (!next) break;
    path = next.startsWith(BASE) ? next.slice(BASE.length) : next.startsWith('/') ? next : null;
  }

  return out;
}

// Post a new comment to a v4 file — used by the portal's own comment composer
// (server-side, OAuth-authenticated), never the client's browser directly, so
// it never triggers Frame.io's guest "who are you" identity flow.
export async function createComment(fileId: string, text: string, timestampSeconds?: number): Promise<FrameioComment> {
  const body: Record<string, unknown> = { text };
  if (typeof timestampSeconds === 'number') body.timestamp = timestampSeconds;

  const raw = await post<Record<string, unknown>>(`/accounts/${accountId()}/files/${fileId}/comments`, body, 'comments');
  const data = ((raw?.data ?? raw) as Record<string, unknown>) ?? {};
  return mapComment(data);
}

export interface ReviewData {
  fileId: string;
  ready: boolean;
  downloadUrl: string | null;
  status: string | null;
  comments: FrameioComment[];
}

// Everything the client video-review page needs in one resolve: the playable
// file URL and the existing comment thread, sharing a single fileId lookup.
export async function getReviewData(frameLink: string): Promise<ReviewData> {
  const fileId = await resolveFileId(frameLink);
  const [media, comments] = await Promise.all([getFileMedia(fileId), listComments(fileId)]);
  return { fileId, ...media, comments };
}
