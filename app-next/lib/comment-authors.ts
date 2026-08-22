// Every comment the portal posts to Frame.io goes through LBM's own
// server-side OAuth connection, never the individual client contact's
// identity — so Frame.io's own "owner"/"author" on every comment is the same
// shared service account regardless of who actually typed it (see
// lib/frameio.ts createComment/mapComment). frameio_comment_authors is the
// only place the real portal user is recorded; this overlays that name onto
// whatever Frame.io itself reports, everywhere comments are read.

import { db } from '@/lib/db';
import { frameioCommentAuthors } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import type { FrameioComment } from '@/lib/frameio';

export async function recordCommentAuthor(frameioCommentId: string, authorName: string): Promise<void> {
  try {
    await db.insert(frameioCommentAuthors)
      .values({ frameioCommentId, authorName })
      .onConflictDoNothing();
  } catch (e) {
    // Never let attribution bookkeeping break the comment post itself.
    console.error('[recordCommentAuthor] failed:', e);
  }
}

export async function withRealAuthors<T extends FrameioComment>(comments: T[]): Promise<T[]> {
  if (comments.length === 0) return comments;
  const rows = await db
    .select({ frameioCommentId: frameioCommentAuthors.frameioCommentId, authorName: frameioCommentAuthors.authorName })
    .from(frameioCommentAuthors)
    .where(inArray(frameioCommentAuthors.frameioCommentId, comments.map(c => c.id)));
  if (rows.length === 0) return comments;
  const byId = new Map(rows.map(r => [r.frameioCommentId, r.authorName]));
  return comments.map(c => byId.has(c.id) ? { ...c, authorName: byId.get(c.id)! } : c);
}
