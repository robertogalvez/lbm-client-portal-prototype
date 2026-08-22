// Mirror Frame.io review comments into the video's ClickUp task, as ONE
// combined comment per decision.
//
// Clients leave timestamped feedback in the native review player, which the
// portal never mirrored to ClickUp in real time — historically the AM copied
// each comment out by hand. This module pulls the file's comments via the v4
// API and, when there's anything not yet mirrored, posts them all as a single
// ClickUp comment, using `frameio_synced_comments` as the idempotency ledger
// (each Frame.io comment id is included in exactly one ClickUp post).
//
// Called only from /api/client/approve, at decision time — deliberately NOT
// on a timer. Comments accumulate on Frame.io as the client reviews (still
// posted there in real time by /api/client/comment) but only reach ClickUp
// once, packed together, the moment the client clicks Approve or Request
// changes — one comment to read instead of a scattered feed, and it doubles
// as the signal that closes the composer (see components/client/CommentComposer + VideoDecisionContext).
//
// Never throws: comment capture must not break the approval write.

import { db } from '@/lib/db';
import { frameioSyncedComments } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { resolveFileId, listComments, isConfigured, type FrameioComment } from '@/lib/frameio';
import { withRealAuthors } from '@/lib/comment-authors';
import { postComment } from '@/lib/clickup-write';

export interface CommentSyncResult {
  ok: boolean;
  posted: number;
  alreadySynced: number;
  error?: string;
}

// A one-shot summary note (the optional text on the "Request changes" box)
// folded into the SAME combined comment as the timestamped Frame.io ones —
// the goal is exactly one ClickUp comment representing everything the client
// said, not two.
export interface ExtraNote {
  authorName: string;
  text: string;
}

function formatBatchForClickUp(comments: FrameioComment[], extraNote?: ExtraNote): string {
  const lines = comments.map(c => {
    const at = c.timestampLabel ? `[at ${c.timestampLabel}] ` : '';
    const text = c.text.trim() || '(annotation without text)';
    return `${at}${c.authorName ?? 'Client'}: ${text}`;
  });
  if (extraNote?.text.trim()) {
    lines.push(`${extraNote.authorName}: ${extraNote.text.trim()}`);
  }
  const header = lines.length === 1
    ? '🎬 Client feedback:'
    : `🎬 Client feedback (${lines.length} comments):`;
  return [header, ...lines].join('\n');
}

export async function syncFrameioComments(taskId: string, frameLink: string, extraNote?: ExtraNote): Promise<CommentSyncResult> {
  const hasExtraNote = !!extraNote?.text.trim();
  try {
    if (!isConfigured()) {
      if (hasExtraNote) {
        await postComment(taskId, formatBatchForClickUp([], extraNote), false);
        return { ok: true, posted: 1, alreadySynced: 0 };
      }
      return { ok: false, posted: 0, alreadySynced: 0, error: 'Frame.io is not configured' };
    }

    const fileId = await resolveFileId(frameLink);
    const comments = await withRealAuthors(await listComments(fileId));

    const existing = comments.length > 0
      ? await db
          .select({ id: frameioSyncedComments.frameioCommentId })
          .from(frameioSyncedComments)
          .where(inArray(frameioSyncedComments.frameioCommentId, comments.map(c => c.id)))
      : [];
    const seen = new Set(existing.map(r => r.id));

    const fresh = comments
      .filter(c => !seen.has(c.id))
      .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

    if (fresh.length === 0 && !hasExtraNote) {
      return { ok: true, posted: 0, alreadySynced: seen.size };
    }

    // Claim each comment via an atomic insert BEFORE posting anything — the
    // race guard: two decision-time syncs for the same task shouldn't both
    // grab the same comment and each post their own combined comment for it.
    // The unique constraint on frameio_comment_id makes this claim atomic
    // even under true concurrency; returning() tells us whether we won it.
    const claimed: FrameioComment[] = [];
    for (const c of fresh) {
      const rows = await db
        .insert(frameioSyncedComments)
        .values({ frameioCommentId: c.id, clickupTaskId: taskId })
        .onConflictDoNothing()
        .returning({ id: frameioSyncedComments.frameioCommentId });
      if (rows.length > 0) claimed.push(c);
    }
    if (claimed.length === 0 && !hasExtraNote) {
      return { ok: true, posted: 0, alreadySynced: seen.size };
    }

    try {
      await postComment(taskId, formatBatchForClickUp(claimed, extraNote), false);
    } catch (e) {
      // Release the whole batch's claims so a future run retries instead of
      // losing them forever (the ledger would otherwise say "synced" for
      // comments that never actually reached ClickUp).
      if (claimed.length > 0) {
        await db.delete(frameioSyncedComments).where(inArray(frameioSyncedComments.frameioCommentId, claimed.map(c => c.id)));
      }
      throw e;
    }

    return { ok: true, posted: claimed.length + (hasExtraNote ? 1 : 0), alreadySynced: seen.size };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Frame.io comment sync failed for task ${taskId}:`, msg);
    return { ok: false, posted: 0, alreadySynced: 0, error: msg };
  }
}
