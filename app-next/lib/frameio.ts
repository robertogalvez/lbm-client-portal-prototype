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

export type FrameioStage = 'parse' | 'stack' | 'file' | 'auth';

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
// collection, which is itself a synthetic/auto-generated container (not a real
// folder — `root_folder_id` is null on it), so `/folders/*` shapes don't apply.
// ⚠️ As of Frame.io's own "Migrating to API v4" forum thread (Oct 2025), the
// Frame.io team confirmed there was no public v4 endpoint to list a share's
// assets and that it was only "on the roadmap" — this may still be unshipped.
// Tries a few plausible REST shapes in order and returns whichever responds,
// plus all attempts for diagnosis if none do.
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
    `/accounts/${accountId()}/collections/${collectionId}/assets`,
    `/accounts/${accountId()}/collections/${collectionId}/files`,
    `/accounts/${accountId()}/folders/${collectionId}/children`,
    `/accounts/${accountId()}/files?parent_id=${collectionId}`,
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

// Resolve the final high-quality download URL for the video task's Frame link.
// Handles three link shapes:
//   - full app.frame.io / next.frame.io asset URLs (last path segment is the id)
//   - long share URLs ".../share/{shareId}/view/{assetId}" (proven live)
//   - short f.io links → redirect → bare share URL ".../share/{shareId}"
//     (no /view/{id}) → resolved via the Shares API to find the asset id
// Throws FrameioError on hard API failures (surfaced as an AM comment upstream);
// returns { ready: false } when the asset simply isn't transcoded yet.
export async function resolveFinalAsset(frameLink: string): Promise<FinalAsset> {
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

  const file = await get<{ data?: { status?: string; media_links?: { high_quality?: { download_url?: string | null } } } }>(
    `/accounts/${accountId()}/files/${headVersionId}?include=media_links.high_quality`,
    'file',
  );
  const status = file?.data?.status ?? null;
  const downloadUrl = file?.data?.media_links?.high_quality?.download_url ?? null;
  const ready = status === 'transcoded' && !!downloadUrl;
  return { ready, status, downloadUrl };
}
