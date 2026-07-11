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
//  - Auth reuses FRAMEIO_API_TOKEN (same bearer token as the comment route).

const BASE = 'https://api.frame.io/v4';

export type FrameioStage = 'parse' | 'stack' | 'file';

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
  return !!(process.env.FRAMEIO_API_TOKEN && process.env.FRAMEIO_ACCOUNT_ID);
}

function accountId(): string {
  const id = process.env.FRAMEIO_ACCOUNT_ID;
  if (!id) throw new FrameioError('FRAMEIO_ACCOUNT_ID not set', 'stack');
  return id;
}

function fioHeaders() {
  return {
    Authorization: `Bearer ${process.env.FRAMEIO_API_TOKEN ?? ''}`,
    'Content-Type': 'application/json',
    'api-version': 'experimental',
  };
}

async function get<T = Record<string, unknown>>(path: string, stage: FrameioStage): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: fioHeaders(), cache: 'no-store' });
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
