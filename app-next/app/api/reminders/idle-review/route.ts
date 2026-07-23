// 24h idle-review reminder — pings the assigned AM when a video has sat in
// "for client review" this long with no client decision, so they can follow
// up with the client directly. Invoked by the scheduled Netlify function or
// manually with the cron secret.
//
// Idle time is measured from video_cache.reviewEnteredAt (stamped by
// app/api/webhooks/clickup exactly when a task enters this status), not
// dateUpdated, since ClickUp bumps dateUpdated on any field edit — an AM or
// editor touching an unrelated field shouldn't reset the client's idle clock.
// reviewIdleRemindedAt guards against reminding more than once per round; it
// resets whenever the task re-enters "for client review" for a new round.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { and, eq, isNull, isNotNull, lte } from 'drizzle-orm';
import { notifyAmOfIdleReview } from '@/lib/notify-am';

const IDLE_HOURS = 24;
const MAX_PER_RUN = 25;

function normStatus(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const threshold = new Date(Date.now() - IDLE_HOURS * 60 * 60 * 1000);

  const candidates = await db
    .select({
      taskId: videoCache.clickupTaskId,
      status: videoCache.status,
      title: videoCache.title,
      clientFacingTitle: videoCache.clientFacingTitle,
      clientName: videoCache.clientName,
      assignedAmName: videoCache.assignedAmName,
      reviewEnteredAt: videoCache.reviewEnteredAt,
    })
    .from(videoCache)
    .where(and(
      isNotNull(videoCache.reviewEnteredAt),
      lte(videoCache.reviewEnteredAt, threshold),
      isNull(videoCache.reviewIdleRemindedAt),
    ))
    .limit(MAX_PER_RUN);

  // Defensive re-check in JS: reviewEnteredAt only means something while the
  // task is still actually in "for client review" (it isn't cleared on exit).
  const idle = candidates.filter(c => normStatus(c.status) === 'for client review');

  const results: Record<string, string> = {};
  for (const t of idle) {
    const hoursIdle = (Date.now() - t.reviewEnteredAt!.getTime()) / (60 * 60 * 1000);
    await notifyAmOfIdleReview({
      assignedAmName: t.assignedAmName,
      taskId: t.taskId,
      videoTitle: t.clientFacingTitle || t.title || t.taskId,
      clientName: t.clientName,
      hoursIdle,
    });
    await db.update(videoCache).set({ reviewIdleRemindedAt: new Date() }).where(eq(videoCache.clickupTaskId, t.taskId));
    results[t.taskId] = 'reminded';
  }

  return NextResponse.json({ ok: true, considered: candidates.length, reminded: idle.length, results });
}
