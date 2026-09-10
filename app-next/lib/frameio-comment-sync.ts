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
import { frameioSyncedComments, frameioCommentAuthors } from '@/lib/db/schema';
import { inArray } from 'drizzle-orm';
import { resolveFileId, listComments, isConfigured, type FrameioComment } from '@/lib/frameio';
import { withRealAuthors } from '@/lib/comment-authors';
import { postComment } from '@/lib/clickup-write';

export interface CommentSyncResult {
  ok: boolean;
  posted: number;
  alreadySynced: number;
  error?: string;
  // Set when Frame.io itself couldn't be reached (wrong-account OAuth, outage,
  // not configured) but an extra note still got posted anyway — see the
  // guaranteed-delivery split in syncFrameioComments below. Distinct from
  // `error`, which means the ClickUp write itself failed.
  frameError?: string;
}

// A one-shot summary note (the optional text on the "Request changes" box)
// folded into the SAME combined comment as the timestamped Frame.io ones —
// the goal is exactly one ClickUp comment representing everything the client
// said, not two.
export interface ExtraNote {
  authorName: string;
  text: string;
}

function formatBatchForClickUp(
  comments: FrameioComment[],
  extraNote: ExtraNote | undefined,
  realAuthorNames: Map<string, string>,
): string {
  const blocks = comments.map(c => {
    const at = c.timestampLabel ? ` — [at ${c.timestampLabel}]` : '';
    const text = c.text.trim() || '(annotation without text)';
    const authorName = realAuthorNames.get(c.id) ?? c.authorName ?? 'Client';
    return `👤 ${authorName.toUpperCase()}${at}\n${text}`;
  });
  if (extraNote?.text.trim()) {
    blocks.push(`👤 ${extraNote.authorName.toUpperCase()}\n${extraNote.text.trim()}`);
  }
  const header = blocks.length === 1
    ? '🎬 Client feedback:'
    : `🎬 Client feedback (${blocks.length} comments):`;
  return [header, ...blocks].join('\n\n');
}

// Frame.io fetch + claim, isolated from the ClickUp write so a Frame.io
// failure (thrown here) can never also take down posting an extra note —
// see the split in syncFrameioComments below.
async function claimUnsyncedComments(taskId: string, frameLink: string): Promise<{ claimed: FrameioComment[]; alreadySynced: number }> {
  const fileId = await resolveFileId(frameLink);
  const comments = await withRealAuthors(await listComments(fileId));
  if (comments.length === 0) return { claimed: [], alreadySynced: 0 };

  const existing = await db
    .select({ id: frameioSyncedComments.frameioCommentId })
    .from(frameioSyncedComments)
    .where(inArray(frameioSyncedComments.frameioCommentId, comments.map(c => c.id)));
  const seen = new Set(existing.map(r => r.id));

  const fresh = comments
    .filter(c => !seen.has(c.id))
    .sort((a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? ''));

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
  return { claimed, alreadySynced: seen.size };
}

// How many of this task's Frame.io comments haven't reached ClickUp yet —
// used by the approve route's "you have unmirrored notes" guard. Throws on
// any Frame.io error (not configured, auth, outage); the caller decides
// whether to fail open or closed, it's not this function's call to make.
export async function countUnmirroredComments(taskId: string, frameLink: string): Promise<number> {
  if (!isConfigured()) return 0;
  const fileId = await resolveFileId(frameLink);
  const comments = await listComments(fileId);
  if (comments.length === 0) return 0;
  const existing = await db
    .select({ id: frameioSyncedComments.frameioCommentId })
    .from(frameioSyncedComments)
    .where(inArray(frameioSyncedComments.frameioCommentId, comments.map(c => c.id)));
  const seen = new Set(existing.map(r => r.id));
  return comments.filter(c => !seen.has(c.id)).length;
}

// Mirrors any un-synced Frame.io comments plus an optional typed note into
// ONE combined ClickUp comment. The Frame.io fetch/claim step and the ClickUp
// post are deliberately independent: a Frame.io failure (wrong-account OAuth,
// outage, not configured) is captured as `frameError` and never blocks
// posting `extraNote` — a client's typed note must reach ClickUp regardless
// of whether their timestamped Frame.io notes could be read. Previously both
// were wrapped in one try/catch, so a Frame.io failure silently dropped the
// note too (confirmed live: a "changes" decision with a typed note produced
// zero ClickUp comments while Frame.io auth was broken).
export async function syncFrameioComments(taskId: string, frameLink: string, extraNote?: ExtraNote): Promise<CommentSyncResult> {
  const hasExtraNote = !!extraNote?.text.trim();

  let claimed: FrameioComment[] = [];
  let alreadySynced = 0;
  let frameError: string | undefined;

  if (!isConfigured()) {
    frameError = 'Frame.io is not configured';
  } else {
    try {
      const result = await claimUnsyncedComments(taskId, frameLink);
      claimed = result.claimed;
      alreadySynced = result.alreadySynced;
    } catch (e) {
      frameError = e instanceof Error ? e.message : String(e);
      console.error(`Frame.io comment fetch failed for task ${taskId}:`, frameError);
    }
  }

  if (claimed.length === 0 && !hasExtraNote) {
    return frameError
      ? { ok: false, posted: 0, alreadySynced, error: frameError }
      : { ok: true, posted: 0, alreadySynced };
  }

  const authorRows = claimed.length > 0
    ? await db
        .select({ id: frameioCommentAuthors.frameioCommentId, name: frameioCommentAuthors.authorName })
        .from(frameioCommentAuthors)
        .where(inArray(frameioCommentAuthors.frameioCommentId, claimed.map(c => c.id)))
    : [];
  const realAuthorNames = new Map(authorRows.map(r => [r.id, r.name]));

  const body = formatBatchForClickUp(claimed, extraNote, realAuthorNames)
    + (frameError ? `\n\n⚠️ Could not fetch this client's Frame.io video notes — check Frame.io directly.` : '');

  try {
    await postComment(taskId, body, false);
  } catch (e) {
    // Release the whole batch's claims so a future run retries instead of
    // losing them forever (the ledger would otherwise say "synced" for
    // comments that never actually reached ClickUp).
    if (claimed.length > 0) {
      await db.delete(frameioSyncedComments).where(inArray(frameioSyncedComments.frameioCommentId, claimed.map(c => c.id)));
    }
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to post client-feedback comment for task ${taskId}:`, msg);
    return { ok: false, posted: 0, alreadySynced, error: msg, ...(frameError ? { frameError } : {}) };
  }

  return {
    ok: true,
    posted: claimed.length + (hasExtraNote ? 1 : 0),
    alreadySynced,
    ...(frameError ? { frameError } : {}),
  };
}
