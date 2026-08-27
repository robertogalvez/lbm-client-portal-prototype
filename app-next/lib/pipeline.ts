// Where a video sits *right now*, and whether it has been sitting there too
// long. This math used to live inline in app/(app)/dashboard/page.tsx, which
// meant the dashboard and the Clients page each had their own idea of what
// "in flight" meant. It lives here now so every admin view counts the same
// video the same way — see lib/admin-views.ts, which is the only intended
// caller for the per-client roll-up.

import type { MappedTask } from '@/lib/clickup';
import { BACKLOG_STATUSES, resolvePostedAt } from '@/lib/portfolio';

export type PipelineStage = 'backlog' | 'editing' | 'qc' | 'review' | 'ready';
export type PipelineStageCounts = Record<PipelineStage, number>;
export type PipelinePeriod = 'today' | 'week' | 'month';

// The five in-flight stages partition every non-terminal, non-hidden status
// exactly once (no leaks, no overlaps), so summing them for any client — or
// across the roster — always equals the true in-flight count.
export const PIPELINE_STAGE_KEYS: PipelineStage[] = ['backlog', 'editing', 'qc', 'review', 'ready'];

// "QC Final" got split per reviewer at some point — "qc final - am" became
// "QC Final (Daniel)", and "QC Final (Michel)" now exists alongside it. That
// is not a one-off rename: this workspace attributes the final QC pass to
// whichever teammate did it, so a new name will keep appearing every time
// someone joins or leaves that rotation. Matching every "qc final …" status
// by prefix (see qcStatusMatches) means the next reviewer's name doesn't
// need a code change — only a genuinely new stage would.
export const QC_STATUSES = new Set(['tc - qc (somu)']);
const QC_FINAL_PREFIX = 'qc final';

function qcStatusMatches(normStatus: string): boolean {
  return QC_STATUSES.has(normStatus) || normStatus.startsWith(QC_FINAL_PREFIX);
}
export const PIPELINE_EDITING_STATUSES = new Set(['in progress (editor)', 'in progress (corrections)']);
export const POSTED = 'posted in socials';
// ClickUp's two terminal "this will never ship" statuses. Excluded from
// stage buckets entirely — an archived video is neither in flight nor
// unclassified, it's just gone. lib/client-detail.ts uses the same set to
// decide what the video ledger hides behind "Show N archived".
export const ARCHIVED_STATUSES = new Set(['archived', 'not posted - discarded']);

export const DAY_MS = 86_400_000;
// "Untouched for more than 3 days" — the threshold the dashboard has always
// used for its overdue treatment.
//
// KNOWN DATA QUESTION: with today's ClickUp data every non-zero stage except
// Backlog reports stalled == total, which suggests dateUpdated is not being
// touched when a video moves between statuses. That would make "stalled" read
// as "anything not posted today" rather than "untouched for 3+ days". The
// definition below is the intended one; confirm dateUpdated's behaviour in
// ClickUp before treating the number as precise.
export const STALL_MS = 3 * DAY_MS;

export function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseDate(s: string) {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}

export function emptyStageCounts(): PipelineStageCounts {
  return { backlog: 0, editing: 0, qc: 0, review: 0, ready: 0 };
}

export function pipelineStageOf(normStatus: string): PipelineStage | null {
  if (BACKLOG_STATUSES.has(normStatus)) return 'backlog';
  if (PIPELINE_EDITING_STATUSES.has(normStatus)) return 'editing';
  if (qcStatusMatches(normStatus)) return 'qc';
  if (normStatus === 'for client review') return 'review';
  if (normStatus === 'ready to be posted') return 'ready';
  return null; // POSTED — the caller handles it, it is the one date-scoped stage
}

export interface StageBuckets {
  counts: PipelineStageCounts;
  stalled: PipelineStageCounts;
  posted: Record<PipelinePeriod, number>;
  /** Every video sitting in one of the five in-flight stages, plus unclassified (see below). */
  inFlight: number;
  /** Stalled in a stage we own — backlog is excluded (footage supply, not a stall). */
  stalledWithUs: number;
  /** Anything parked in client review: the blocker is the client, not us. */
  waitingOnClient: number;
  /**
   * Non-terminal ClickUp statuses that matched none of the five stages —
   * evidence the status vocabulary drifted (a column renamed, a new stage
   * added) and this mapping was never updated. Confirmed live: "QC FINAL
   * (DANIEL)" replaced "qc final - am" on one board and the task simply
   * stopped counting anywhere — not delivered, not in flight, not archived.
   * Folded into inFlight (it IS in-flight work) but tracked separately so a
   * screen can flag it instead of quietly under-reporting the pipeline.
   */
  unclassified: number;
  /** The distinct unmapped statuses behind `unclassified`, for a dev warning or an admin-facing list. */
  unclassifiedStatuses: string[];
}

/**
 * Bucket one client's tasks (or the whole roster's) into stages.
 *
 * `stalledWithUs` and `waitingOnClient` are deliberately disjoint and together
 * make up the "stuck" headline — a video is blocked on exactly one party.
 */
export function buildStageBuckets(
  tasks: MappedTask[],
  now: number,
  postedCutoffs: Record<PipelinePeriod, number>,
): StageBuckets {
  const counts = emptyStageCounts();
  const stalled = emptyStageCounts();
  const posted: Record<PipelinePeriod, number> = { today: 0, week: 0, month: 0 };
  let unclassified = 0;
  const unclassifiedStatusSet = new Set<string>();

  for (const t of tasks) {
    const status = norm(t.status);

    if (ARCHIVED_STATUSES.has(status)) continue;

    if (status === POSTED) {
      const postedAt = resolvePostedAt(t);
      if (postedAt <= now) {
        (Object.keys(postedCutoffs) as PipelinePeriod[]).forEach(p => {
          if (postedAt >= postedCutoffs[p]) posted[p]++;
        });
        continue;
      }
      // Queued into VistaSocial with a future publish date: not live yet, so
      // it still reads as in-flight rather than vanishing from the board.
      counts.ready++;
      if (now - parseDate(t.dateUpdated) > STALL_MS) stalled.ready++;
      continue;
    }

    const stage = pipelineStageOf(status);
    if (!stage) {
      // Not a recognised in-flight stage. Rather than silently dropping the
      // task (its previous fate), count it as in-flight-but-unclassified and
      // name the status, so the next ClickUp rename shows up as a number
      // instead of a quietly shrinking pipeline.
      unclassified++;
      unclassifiedStatusSet.add(t.status);
      continue;
    }
    counts[stage]++;
    // Backlog isn't a "stall" concept — raw-footage supply is its own problem
    // (see buildBacklog in lib/portfolio.ts).
    if (stage !== 'backlog' && now - parseDate(t.dateUpdated) > STALL_MS) stalled[stage]++;
  }

  const inFlight = PIPELINE_STAGE_KEYS.reduce((s, k) => s + counts[k], 0) + unclassified;
  const stalledWithUs = stalled.editing + stalled.qc + stalled.ready;
  const waitingOnClient = counts.review;
  const unclassifiedStatuses = Array.from(unclassifiedStatusSet).sort();

  if (unclassified > 0 && process.env.NODE_ENV !== 'production') {
    console.warn(
      `[pipeline] ${unclassified} task(s) matched no known stage: ${unclassifiedStatuses.join(', ')}. ` +
      'They are counted as in-flight but not attributed to a stage — add them to QC_STATUSES / ' +
      'PIPELINE_EDITING_STATUSES / BACKLOG_STATUSES or a new stage in lib/pipeline.ts.',
    );
  }

  return { counts, stalled, posted, inFlight, stalledWithUs, waitingOnClient, unclassified, unclassifiedStatuses };
}

/** Calendar-aligned today/month, rolling 7-day week — the app's existing convention. */
export function postedCutoffs(now: Date): Record<PipelinePeriod, number> {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return { today: todayStart, week: now.getTime() - 7 * DAY_MS, month: monthStart };
}
