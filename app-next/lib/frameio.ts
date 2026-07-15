// Frame.io v4 helper — resolves the final downloadable asset for a video task.
// Mirrors the Make.com blueprint's Frame.io steps:
//   parse version-stack id from the "Updated Frame Link (Editor)" URL
//   → GET version_stacks/{id}          → head_version.id
//   → GET files/{headVersionId}?include=media_links.high_quality
//                                       → require status "transcoded" + download_url
//
// Notes / constraints (verified):
//  - media_links requires the `api-version: experimental` header.
//  - media_links.*.download_url can be null until transcoding completes; the
//    URL is signed and time-limited. Callers treat "not ready" as retry-later.
//  - Auth: Adobe IMS OAuth Server-to-Server (client_credentials). We mint and
//    cache an access token from the client id/secret; FRAMEIO_API_TOKEN, if set,
//    is used as a manual override (skips the OAuth exchange).

const BASE = 'https://api.frame.io/v4';
const IMS_URL = process.env.FRAMEIO_IMS_URL || 'https://ims-na1.adobelogin.com/ims/token/v3';

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

// Cache the minted token across warm invocations; refresh 60s before expiry.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  // Manual override — a pre-minted access token.
  if (process.env.FRAMEIO_API_TOKEN) return process.env.FRAMEIO_API_TOKEN;

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const clientId = process.env.FRAMEIO_CLIENT_ID;
  const clientSecret = process.env.FRAMEIO_CLIENT_SECRET;
  const scope = process.env.FRAMEIO_OAUTH_SCOPES;
  if (!clientId || !clientSecret) {
    throw new FrameioError('FRAMEIO_CLIENT_ID / FRAMEIO_CLIENT_SECRET not set', 'auth');
  }
  if (!scope) {
    throw new FrameioError('FRAMEIO_OAUTH_SCOPES not set (copy the scopes from the Adobe Developer Console)', 'auth');
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: scope.split(/[,\s]+/).filter(Boolean).join(','),
  });

  const res = await fetch(IMS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new FrameioError(`Adobe IMS token request failed (${res.status}): ${data.error ?? ''} ${data.error_description ?? ''}`.trim(), 'auth', res.status);
  }
  const expiresInMs = (Number(data.expires_in) || 3600) * 1000;
  tokenCache = { token: data.access_token as string, expiresAt: Date.now() + expiresInMs };
  return tokenCache.token;
}

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

// Read-only auth diagnostics for the debug endpoint. Never returns secret values —
// only presence booleans and a short token prefix — so it's safe to expose.
export async function authDiagnostics(): Promise<Record<string, unknown>> {
  const overrideSet = !!process.env.FRAMEIO_API_TOKEN;
  const base = {
    mode: overrideSet ? 'override (FRAMEIO_API_TOKEN)' : 'adobe-ims',
    frameioApiTokenSet: overrideSet,
    clientIdSet: !!process.env.FRAMEIO_CLIENT_ID,
    clientSecretSet: !!process.env.FRAMEIO_CLIENT_SECRET,
    scopesSet: !!process.env.FRAMEIO_OAUTH_SCOPES,
    accountIdSet: !!process.env.FRAMEIO_ACCOUNT_ID,
    imsUrl: IMS_URL,
  };
  try {
    const token = await getAccessToken();
    return {
      ...base,
      tokenObtained: true,
      tokenPrefix: token.slice(0, 8) + '…',
      expiresInSec: tokenCache ? Math.round((tokenCache.expiresAt - Date.now()) / 1000) : null,
    };
  } catch (e) {
    return { ...base, tokenObtained: false, error: e instanceof Error ? e.message : String(e) };
  }
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
