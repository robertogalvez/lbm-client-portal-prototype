import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import {
  extractReviewLinkId,
  resolveReviewLinkToAsset,
  getAssetComments,
} from '@/lib/frameio';

// GET /api/frameio/comments?frameLink=<url>
// Resolves the review URL → asset ID → comments and returns both.
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const frameLink = searchParams.get('frameLink');
  if (!frameLink) return NextResponse.json({ error: 'frameLink required' }, { status: 400 });

  if (!process.env.FRAMEIO_API_TOKEN) {
    return NextResponse.json({ comments: [], assetId: null });
  }

  const reviewLinkId = extractReviewLinkId(frameLink);
  if (!reviewLinkId) {
    return NextResponse.json({ comments: [], assetId: null });
  }

  const assetId = await resolveReviewLinkToAsset(reviewLinkId);
  if (!assetId) {
    return NextResponse.json({ comments: [], assetId: null });
  }

  try {
    const comments = await getAssetComments(assetId);
    return NextResponse.json({ comments, assetId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
