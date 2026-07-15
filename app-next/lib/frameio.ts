// Frame.io v4 helper — resolves the final downloadable asset for a video task,
// authenticated via Frame.io's OAuth 2.0 (PKCE) app.
//
// Auth model (Frame.io Developer Portal OAuth app, not Adobe IMS):
//  - One-time browser authorization (/api/frameio/oauth/start → /callback) yields
//    a refresh token (needs the `offline` scope). Access tokens live ~1h; refresh
//    tokens ~30 days, after which a human must re-authorize.
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
const AUTH_URL = process.env.FRAMEIO_OAUTH_AUTH_URL || 'https://applications.frame.io/oauth2/auth';
const TOKEN_URL = process.env.FRAMEIO_OAUTH_TOKEN_URL || 'https://applications.frame.io/oauth2/token';
const SCOPES = process.env.FRAMEIO_OAUTH_SCOPES || 'asset.read account.read project.read offline';
const PROVIDER = 'frameio';
const REFRESH_TTL_DAYS = 30;

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
  return !!process.env.FRAMEIO_CLIENT_ID;
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

// ── OAuth: authorization URL + code exchange (used by the bootstrap routes) ────

export function buildAuthUrl(redirectUri: string, state: string, codeChallenge: string): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri,
    scope: SCOPES.split(/[,\s]+/).filter(Boolean).join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
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
// refresh_issued_at = now (the 30-day clock) and clears any prior alert.
export async function exchangeAndStoreTokens(code: string, codeVerifier: string, redirectUri: string): Promise<void> {
  const data = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    code_verifier: codeVerifier,
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
// (Frame.io's 30-day expiry runs from the original login, not each refresh).
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const data = await postToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId(),
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

// Read-only auth diagnostics for /api/publish/debug. Never returns secrets.
export async function authDiagnostics(): Promise<Record<string, unknown>> {
  const conn = await getConnectionStatus().catch(e => ({ error: e instanceof Error ? e.message : String(e) }));
  const base = {
    overrideTokenSet: !!process.env.FRAMEIO_API_TOKEN,
    clientIdSet: !!process.env.FRAMEIO_CLIENT_ID,
    accountIdSet: !!process.env.FRAMEIO_ACCOUNT_ID,
    scopes: SCOPES,
    tokenUrl: TOKEN_URL,
  };
  try {
    const token = await getAccessToken();
    return { ...base, connection: conn, tokenObtained: true, tokenPrefix: token.slice(0, 8) + '…' };
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

export interface FinalAsset {
  ready: boolean;              // transcoded AND has a usable download URL
  status: string | null;
  downloadUrl: string | null;
}

// Resolve the final high-quality download URL for the video task's Frame link.
// Throws FrameioError on hard API failures (surfaced as an AM comment upstream);
// returns { ready: false } when the asset simply isn't transcoded yet.
export async function resolveFinalAsset(frameLink: string): Promise<FinalAsset> {
  const stackId = parseVersionStackId(frameLink);
  if (!stackId) throw new FrameioError('Could not parse a Frame.io asset id from the link', 'parse');

  const stack = await get<{ data?: { head_version?: { id?: string } } }>(
    `/accounts/${accountId()}/version_stacks/${stackId}`,
    'stack',
  );
  const headVersionId = stack?.data?.head_version?.id;
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
