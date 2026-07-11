// Instagram URL capture pass. Scans for published-but-uncaptured videos, asks
// Vista Social for the live Instagram permalink, and distributes it (ClickUp
// field + comment + status + cache). Invoked by the scheduled Netlify function
// `capture-vistasocial-urls` (thin shim) or manually with the cron secret.
//
// Gentle by design (Vista Social deactivates keys that repeatedly hit the limit):
//  - only polls posts whose scheduled time has passed (they can be live),
//  - bounded to a 48h window per post (older rows drop out of polling),
//  - stops the whole run on the first RateLimitError.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { and, isNull, isNotNull, lte, gte } from 'drizzle-orm';
import * as vista from '@/lib/vistasocial';
import { distributeInstagramUrl } from '@/lib/publish/distribute-instagram-url';

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
  let rateLimited = false;

  for (const c of candidates) {
    const ids = (c.postIds ?? '').split(',').map(s => s.trim()).filter(Boolean);
    try {
      for (const id of ids) {
        const url = await vista.getInstagramPermalink(id);
        if (url) {
          const did = await distributeInstagramUrl(c.taskId, url);
          if (did) distributed++;
          break; // one Instagram permalink per task is enough
        }
      }
    } catch (e) {
      if (e instanceof vista.RateLimitError) { rateLimited = true; break; }
      // Other per-post errors: skip this task this run, try again next run.
    }
  }

  return NextResponse.json({ ok: true, scanned: candidates.length, distributed, rateLimited });
}
