const BASE = 'https://api.frame.io/v4';

function fioHeaders() {
  return {
    Authorization: `Bearer ${process.env.FRAMEIO_API_TOKEN ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function fioGet(path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: fioHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Frame.io GET ${path} → ${res.status}`);
  return res.json();
}

async function fioPost(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: fioHeaders(),
    body: JSON.stringify(body),
  });
  return res.json();
}

// Extracts the review link UUID from various Frame.io URL formats:
//   https://app.frame.io/reviews/{uuid}
//   https://on.frame.io/{uuid}
//   https://f.io/{code}  — short links can't be resolved here; caller must handle
export function extractReviewLinkId(url: string): string | null {
  if (!url) return null;
  const uuidRe = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i;
  const m = url.match(uuidRe);
  return m?.[1] ?? null;
}

// Resolves a review link ID → the first asset's ID in that review.
// Frame.io v4: GET /v4/review_links/{id} → { items: [{ asset_id }] }
export async function resolveReviewLinkToAsset(reviewLinkId: string): Promise<string | null> {
  try {
    const data = await fioGet(`/review_links/${reviewLinkId}`);
    return data?.items?.[0]?.asset_id ?? data?.asset_id ?? null;
  } catch {
    return null;
  }
}

export interface FrameioComment {
  id: string;
  text: string;
  timestamp: number | null; // video seconds, null = general comment
  author: string;
  createdAt: string; // ISO
  replies: FrameioComment[];
}

function mapComment(c: Record<string, any>): FrameioComment {
  return {
    id: c.id ?? '',
    text: c.text ?? '',
    timestamp: c.timestamp != null ? Number(c.timestamp) : null,
    author: c.owner?.name ?? c.owner?.email ?? 'Unknown',
    createdAt: c.inserted_at ?? c.created_at ?? '',
    replies: Array.isArray(c.replies) ? c.replies.map(mapComment) : [],
  };
}

export async function getAssetComments(assetId: string): Promise<FrameioComment[]> {
  const data = await fioGet(`/assets/${assetId}/comments`);
  const items: Record<string, any>[] = Array.isArray(data)
    ? data
    : (data?.data ?? data?.items ?? []);
  return items.map(mapComment);
}

export async function postAssetComment(
  assetId: string,
  text: string,
  timestamp?: number,
): Promise<Record<string, any>> {
  const body: Record<string, unknown> = { text };
  if (typeof timestamp === 'number') body.timestamp = timestamp;
  return fioPost(`/assets/${assetId}/comments`, body);
}
