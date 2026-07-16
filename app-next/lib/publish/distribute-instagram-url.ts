// Capture distribution — once the live Instagram Reel/post URL is known, store it
// on the task's "Instagram URL" custom field (and cache it so the portals show
// the link). No task comment. Idempotent: only acts on the null → value
// transition, so it never double-writes.

import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as clickup from '@/lib/clickup-write';

export async function distributeInstagramUrl(clickupTaskId: string, url: string): Promise<boolean> {
  if (!url) return false;

  // Guard against double-distribution.
  const [row] = await db
    .select({ instagramUrl: videoCache.instagramUrl })
    .from(videoCache)
    .where(eq(videoCache.clickupTaskId, clickupTaskId))
    .limit(1);
  if (row?.instagramUrl) return false;

  // Cache first (drives the portal "View on Instagram" link).
  const set = { instagramUrl: url, lastSyncedAt: new Date() };
  await db
    .insert(videoCache)
    .values({ clickupTaskId, ...set })
    .onConflictDoUpdate({ target: videoCache.clickupTaskId, set });

  // Durable source of truth: the task's "Instagram URL" field (no-op if the
  // field hasn't been created in ClickUp yet).
  const task = await clickup.getTask(clickupTaskId);
  await clickup.setUrlField(task, clickup.FIELD.instagramUrl, url);
  return true;
}
