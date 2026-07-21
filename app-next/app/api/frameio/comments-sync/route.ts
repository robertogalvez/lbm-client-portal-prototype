// Periodic Frame.io → ClickUp comment reconcile. Called by the scheduled shim
// (netlify/functions/sync-frameio-comments.mts) every 5 minutes. For each video
// currently in Client Review with a Frame link, mirrors any new Frame.io
// comments onto the ClickUp task — so the AM sees client feedback as it
// arrives, even before the client clicks Approve / Request changes (that click
// runs the same sync as a guarantee).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { and, ilike, isNotNull } from 'drizzle-orm';
import { isConfigured } from '@/lib/frameio';
import { syncFrameioComments } from '@/lib/frameio-comment-sync';

// Bound per-run work: each video costs a handful of Frame.io calls plus one
// ClickUp write per new comment (100 req/min token limit shared with the rest
// of the pipeline). Videos beyond the cap are picked up on the next run.
const MAX_VIDEOS_PER_RUN = 20;

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isConfigured()) {
    return NextResponse.json({ ok: true, action: 'skipped', reason: 'Frame.io not configured' });
  }

  // `frameio_asset_id` holds the task's Frame link URL (see sync-clickup).
  const rows = await db
    .select({ taskId: videoCache.clickupTaskId, frameLink: videoCache.frameioAssetId })
    .from(videoCache)
    .where(and(ilike(videoCache.status, '%client review%'), isNotNull(videoCache.frameioAssetId)))
    .limit(MAX_VIDEOS_PER_RUN);

  let posted = 0;
  let failed = 0;
  const errors: Record<string, string> = {};

  for (const row of rows) {
    if (!row.frameLink) continue;
    const result = await syncFrameioComments(row.taskId, row.frameLink);
    if (result.ok) {
      posted += result.posted;
    } else {
      failed++;
      if (result.error) errors[row.taskId] = result.error;
    }
  }

  console.log(`Frame.io comment sync: ${rows.length} videos checked, ${posted} comments posted, ${failed} failed`);
  return NextResponse.json({ ok: true, videosChecked: rows.length, posted, failed, errors });
}
