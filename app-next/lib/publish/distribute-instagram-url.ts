// Capture distribution — once the live Instagram permalink is known, post it to
// the ClickUp task (URL field + comment), move the task to "Posted in Socials",
// and cache it so every portal surface shows the link. Idempotent: only acts on
// the null → value transition, so it never double-posts.

import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as clickup from '@/lib/clickup-write';
import { AM_MESSAGES } from './messages';

export async function distributeInstagramUrl(clickupTaskId: string, url: string): Promise<boolean> {
  if (!url) return false;

  // Guard against double-distribution.
  const [row] = await db
    .select({ instagramUrl: videoCache.instagramUrl })
    .from(videoCache)
    .where(eq(videoCache.clickupTaskId, clickupTaskId))
    .limit(1);
  if (row?.instagramUrl) return false;

  // Cache first — the durable ClickUp field write is best-effort (the optional
  // "Instagram URL" field may not exist yet).
  const set = {
    instagramUrl: url,
    publishingStatus: clickup.PUBLISHING_STATUS.published,
    status: clickup.POSTED_IN_SOCIALS_STATUS,
    lastSyncedAt: new Date(),
  };
  await db
    .insert(videoCache)
    .values({ clickupTaskId, ...set })
    .onConflictDoUpdate({ target: videoCache.clickupTaskId, set });

  const task = await clickup.getTask(clickupTaskId);
  await clickup.setUrlField(task, clickup.FIELDS.instagramUrl, url); // no-op if field absent
  await clickup.postComment(clickupTaskId, AM_MESSAGES.instagramPublished(url));
  try {
    await clickup.setTaskStatus(clickupTaskId, clickup.POSTED_IN_SOCIALS_STATUS);
  } catch {
    // Status name may differ per space; the Published field + cache still reflect it.
  }
  return true;
}
