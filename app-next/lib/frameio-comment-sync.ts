// Mirror Frame.io review comments into the video's ClickUp task.
//
// Clients leave timestamped feedback in the embedded Frame.io player, which the
// portal never sees — historically the AM copied each comment to ClickUp by
// hand. This module pulls the file's comments via the v4 API and posts any not
// yet mirrored as ClickUp task comments, using `frameio_synced_comments` as the
// idempotency ledger (each Frame.io comment id lands in ClickUp exactly once).
//
// Called from two places sharing this one implementation:
//   - /api/client/approve — decision-time capture, so the full feedback list is
//     on the task the moment "Approved"/"Changes Requested" is set
//   - /api/frameio/comments-sync — cron reconcile for videos in Client Review,
//     so the AM sees feedback as it arrives even before a decision
//
// Never throws: comment capture must not break the approval write.

import { db } from '@/lib/db';
import { frameioSyncedComments } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { resolveFileId, listComments, isConfigured, type FrameioComment } from '@/lib/frameio';
import { postComment } from '@/lib/clickup-write';

export interface CommentSyncResult {
  ok: boolean;
  posted: number;
  alreadySynced: number;
  error?: string;
}

function formatForClickUp(c: FrameioComment): string {
  const at = c.timestampLabel ? ` [at ${c.timestampLabel}]` : '';
  const text = c.text.trim() || '(annotation without text)';
  return `🎬 ${c.authorName ?? 'Client'} (Frame.io)${at}: ${text}`;
}

export async function syncFrameioComments(taskId: string, frameLink: string): Promise<CommentSyncResult> {
  try {
    if (!isConfigured()) {
      return { ok: false, posted: 0, alreadySynced: 0, error: 'Frame.io is not configured' };
    }

    const fileId = await resolveFileId(frameLink);
    const comments = await listComments(fileId);
    if (comments.length === 0) return { ok: true, posted: 0, alreadySynced: 0 };

    const existing = await db
      .select({ id: frameioSyncedComments.frameioCommentId })
      .from(frameioSyncedComments)
      .where(inArray(frameioSyncedComments.frameioCommentId, comments.map(c => c.id)));
    const seen = new Set(existing.map(r => r.id));

    const fresh = comments
      .filter(c => !seen.has(c.id))
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

    let posted = 0;
    for (const c of fresh) {
      // Claim the comment via an atomic insert BEFORE posting to ClickUp — this
      // is the race guard: the cron sync and a decision-time sync (approve/
      // request-changes) can run concurrently, and a SELECT-then-POST-then-
      // INSERT order lets both pass the "not yet seen" check and double-post.
      // The unique constraint on frameio_comment_id makes this claim atomic
      // even under true concurrency; returning() tells us whether we won it.
      const claimed = await db
        .insert(frameioSyncedComments)
        .values({ frameioCommentId: c.id, clickupTaskId: taskId })
        .onConflictDoNothing()
        .returning({ id: frameioSyncedComments.frameioCommentId });
      if (claimed.length === 0) continue; // another concurrent run already claimed it

      try {
        await postComment(taskId, formatForClickUp(c), false);
        posted++;
      } catch (e) {
        // Release the claim so a future run retries instead of losing the
        // comment forever (the ledger would otherwise say "synced" for a
        // comment that never actually reached ClickUp).
        await db.delete(frameioSyncedComments).where(eq(frameioSyncedComments.frameioCommentId, c.id));
        throw e;
      }
    }

    return { ok: true, posted, alreadySynced: seen.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Frame.io comment sync failed for task ${taskId}:`, msg);
    return { ok: false, posted: 0, alreadySynced: 0, error: msg };
  }
}

// Mark a comment the portal itself just posted to Frame.io as already-mirrored
// (the portal dual-writes it to ClickUp directly), so the sync doesn't repost it.
export async function markCommentSynced(frameioCommentId: string, taskId: string): Promise<void> {
  try {
    await db
      .insert(frameioSyncedComments)
      .values({ frameioCommentId, clickupTaskId: taskId })
      .onConflictDoNothing();
  } catch (e) {
    console.error('Failed to record portal comment in sync ledger:', e);
  }
}
