// Post-publish pass for scheduled Vista Social posts. For each published-but-
// uncaptured video it asks Vista Social for the post state and either:
//  - stores the live Instagram Reel/post URL on the task's "Instagram URL" field
//    (via distributeInstagramUrl), or
//  - if Vista Social reports the post failed (these happen randomly), notifies in
//    the task comments and sets "Posted Status" = "Posting Failed".
// Invoked by the scheduled shim or manually with the cron secret.
//
// Gentle by design (Vista Social deactivates keys that repeatedly hit the limit):
//  - only polls posts whose scheduled time has passed,
//  - bounded to a 48h window per post (older rows drop out of polling),
//  - stops the whole run on the first RateLimitError.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { and, eq, isNull, isNotNull, lte, gte } from 'drizzle-orm';
import * as vista from '@/lib/vistasocial';
import * as clickup from '@/lib/clickup-write';
import { distributeInstagramUrl } from '@/lib/publish/distribute-instagram-url';
import { markPostingFailed } from '@/lib/publish/posting-failed';
import { AM_MESSAGES } from '@/lib/publish/messages';

const GIVE_UP_MS = 48 * 60 * 60 * 1000;
const MAX_PER_RUN = 25;

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!vista.isConfigured()) {
    return NextResponse.json({ error: 'Vista Social not configured' }, { status: 503 });
  }

  const now = Date.now();
  const candidates = await db
    .select({ taskId: videoCache.clickupTaskId, postIds: videoCache.vistasocialPostId })
    .from(videoCache)
    .where(
      and(
        isNotNull(videoCache.vistasocialPostId),
        isNull(videoCache.instagramUrl),
        isNotNull(videoCache.vistasocialScheduledAt),
        lte(videoCache.vistasocialScheduledAt, new Date(now)),
        gte(videoCache.vistasocialScheduledAt, new Date(now - GIVE_UP_MS)),
      ),
    )
    .limit(MAX_PER_RUN);

  let distributed = 0;
  let failed = 0;
  let rateLimited = false;

  for (const c of candidates) {
    const ids = (c.postIds ?? '').split(',').map(s => s.trim()).filter(Boolean);
    try {
      let done = false;
      let failedStatus: string | null = null;

      for (const id of ids) {
        const post = await vista.getPost(id);
        if (post.permalink && vista.isInstagramUrl(post.permalink)) {
          if (await distributeInstagramUrl(c.taskId, post.permalink)) distributed++;
          done = true;
          break;
        }
        if (vista.isFailedStatus(post.status)) failedStatus = post.status;
      }

      // No live URL yet, but Vista Social says it failed → notify + flag, and stop
      // polling this task (clear the post id).
      if (!done && failedStatus) {
        const task = await clickup.getTask(c.taskId);
        await markPostingFailed(task, AM_MESSAGES.postingFailedAsync(failedStatus));
        await db.update(videoCache).set({ vistasocialPostId: null }).where(eq(videoCache.clickupTaskId, c.taskId));
        failed++;
      }
    } catch (e) {
      if (e instanceof vista.RateLimitError) { rateLimited = true; break; }
      // Other per-post errors: skip this task this run, try again next run.
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, distributed, failed, rateLimited });
}
