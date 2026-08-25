// Shared contract/delivery math — the single source every dashboard and
// report view must call into, per the design handoff's invariants §7.5
// ("one quantity, one source") and §7.5a ("no number typed into prose").
// Never reimplement any of this inline in a component.

import type { ContractPeriod, ContractMonth, ContractLineItem } from './db/schema';

// Deliverable types the live pipeline actually counts (video_cache.deliverableType).
// A contract_line_items row can use any free-text type (e.g. 'website') to
// scope an agreement, but only these ever get a real "delivered" count —
// anything else is scope-only: shown, never given a progress bar.
export const PIPELINE_DELIVERABLE_TYPES = ['short_form', 'youtube', 'ad'] as const;
export type PipelineDeliverableType = typeof PIPELINE_DELIVERABLE_TYPES[number];

// ── Month agreement resolution (§7.3) ───────────────────────────────────────
//
// Three distinct cases, and callers must render them distinctly:
//   'full'  — a full calendar month under the standing (or overridden) quota
//   'part'  — contract started/ended mid-month: quota prorated by days under contract
//   'none'  — no agreement applies (package, or the period doesn't cover this month)
// 'none' means: show the raw count only, no denominator, no percentage, no bar.

export type MonthAgreement =
  | { kind: 'none' }
  | { kind: 'full'; quota: number; amended: boolean; scopeNote: string | null }
  | { kind: 'part'; quota: number; daysUnderContract: number; daysInMonth: number; amended: boolean; scopeNote: string | null };

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Days of `month` (YYYY-MM) that fall within [startsOn, endsOn ?? +inf]. */
function daysUnderContractInMonth(period: Pick<ContractPeriod, 'startsOn' | 'endsOn'>, month: string): number {
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1));
  const monthEnd = new Date(Date.UTC(y, m, 0)); // last day of month
  const starts = new Date(period.startsOn);
  const ends = period.endsOn ? new Date(period.endsOn) : null;

  const rangeStart = starts > monthStart ? starts : monthStart;
  const rangeEnd = ends && ends < monthEnd ? ends : monthEnd;
  const diffDays = Math.floor((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
  return Math.max(0, diffDays);
}

/**
 * Resolves what agreement (if any) applies to `period` for `month`.
 * `monthRow` is the contract_months deviation row for this period+month, if
 * one exists (§2 of contract-schema-spec.md — no row means the standard
 * agreement ran). `quota_override` always wins over proration when present.
 */
export function resolveMonthAgreement(
  period: Pick<ContractPeriod, 'startsOn' | 'endsOn' | 'monthlyQuota' | 'model'>,
  monthRow: Pick<ContractMonth, 'active' | 'quotaOverride' | 'scopeNote' | 'amended'> | null,
  month: string,
): MonthAgreement {
  if (monthRow && !monthRow.active) return { kind: 'none' };

  const daysUnder = daysUnderContractInMonth(period, month);
  if (daysUnder === 0) return { kind: 'none' };

  const totalDays = daysInMonth(month);
  const isFullMonth = daysUnder === totalDays;

  if (monthRow?.quotaOverride != null) {
    return isFullMonth
      ? { kind: 'full', quota: monthRow.quotaOverride, amended: monthRow.amended, scopeNote: monthRow.scopeNote ?? null }
      : { kind: 'part', quota: monthRow.quotaOverride, daysUnderContract: daysUnder, daysInMonth: totalDays, amended: monthRow.amended, scopeNote: monthRow.scopeNote ?? null };
  }

  // Package clients (or retainers with no standing monthly_quota) have no
  // denominator to compare against — count alone, per §7.3.
  if (period.model !== 'retainer' || period.monthlyQuota == null) return { kind: 'none' };

  if (isFullMonth) {
    return { kind: 'full', quota: period.monthlyQuota, amended: monthRow?.amended ?? false, scopeNote: monthRow?.scopeNote ?? null };
  }
  const prorated = Math.round((period.monthlyQuota * daysUnder) / totalDays);
  return { kind: 'part', quota: prorated, daysUnderContract: daysUnder, daysInMonth: totalDays, amended: monthRow?.amended ?? false, scopeNote: monthRow?.scopeNote ?? null };
}

/**
 * Same resolution as resolveMonthAgreement, but scoped to one contract line
 * item's own monthlyQuota instead of the period's aggregate one — used once
 * a contract has been broken out by deliverable type. The period still owns
 * the dates (a line item never has its own startsOn/endsOn), so proration
 * is identical; only the quota source and the "no denominator" fallback
 * (a line item with no monthlyQuota, e.g. a package-style scoped type) differ.
 */
export function resolveMonthAgreementForLineItem(
  period: Pick<ContractPeriod, 'startsOn' | 'endsOn'>,
  lineItem: Pick<ContractLineItem, 'monthlyQuota'>,
  monthRow: Pick<ContractMonth, 'active' | 'quotaOverride' | 'scopeNote' | 'amended'> | null,
  month: string,
): MonthAgreement {
  if (monthRow && !monthRow.active) return { kind: 'none' };

  const daysUnder = daysUnderContractInMonth(period, month);
  if (daysUnder === 0) return { kind: 'none' };

  const totalDays = daysInMonth(month);
  const isFullMonth = daysUnder === totalDays;

  if (monthRow?.quotaOverride != null) {
    return isFullMonth
      ? { kind: 'full', quota: monthRow.quotaOverride, amended: monthRow.amended, scopeNote: monthRow.scopeNote ?? null }
      : { kind: 'part', quota: monthRow.quotaOverride, daysUnderContract: daysUnder, daysInMonth: totalDays, amended: monthRow.amended, scopeNote: monthRow.scopeNote ?? null };
  }

  if (lineItem.monthlyQuota == null) return { kind: 'none' };

  if (isFullMonth) {
    return { kind: 'full', quota: lineItem.monthlyQuota, amended: monthRow?.amended ?? false, scopeNote: monthRow?.scopeNote ?? null };
  }
  const prorated = Math.round((lineItem.monthlyQuota * daysUnder) / totalDays);
  return { kind: 'part', quota: prorated, daysUnderContract: daysUnder, daysInMonth: totalDays, amended: monthRow?.amended ?? false, scopeNote: monthRow?.scopeNote ?? null };
}

// ── Single-source figures (§7.5, §7.5a) ─────────────────────────────────────

/** delivered/contracted, or null when there's no meaningful denominator — never synthesize one. */
export function fulfilment(delivered: number, contracted: number): number | null {
  if (!contracted) return null;
  return delivered / contracted;
}

/**
 * published - contracted. Positive = over-delivered, negative = still owed.
 * Every "beyond contract" figure on screen (hero note, stat card, report
 * next-steps prose) must call this once and reuse the result — never
 * recompute or hand-type it, per §7.5 and §7.5a.
 */
export function beyondContract(published: number, contracted: number): number {
  return published - contracted;
}

/**
 * Per-deliverable-type fulfilment, one call covering every line item —
 * mirrors fulfilment() but keyed by deliverableType so a contract with
 * separate short_form/youtube/ad quotas gets one ratio per type instead of
 * a single blended number that would hide an under-delivered type behind
 * an over-delivered one.
 */
export function fulfilmentByType(
  delivered: Record<string, number>,
  lineItems: Pick<ContractLineItem, 'deliverableType' | 'contractedTotal'>[],
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const item of lineItems) {
    result[item.deliverableType] = fulfilment(delivered[item.deliverableType] ?? 0, item.contractedTotal);
  }
  return result;
}

/** Compares actual publish cadence against the contracted cadence_per_week. Null when there's no cadence to compare against (packages). */
export function onCadence(
  publishDates: Date[],
  cadencePerWeek: number | null,
  sinceDate: Date,
  asOf: Date,
): { actualPerWeek: number; expectedPerWeek: number; onTrack: boolean } | null {
  if (cadencePerWeek == null) return null;
  const weeksElapsed = Math.max(1, (asOf.getTime() - sinceDate.getTime()) / (7 * 86_400_000));
  const actualPerWeek = publishDates.length / weeksElapsed;
  return { actualPerWeek, expectedPerWeek: cadencePerWeek, onTrack: actualPerWeek >= cadencePerWeek };
}

// ── Attention score (§5.2) ──────────────────────────────────────────────────
// Exact formula from the handoff: hold×3 + pending×2 + editing×0.2, plus a
// health weight. Drives default sort order within each portfolio group.

export type HealthTier = 'critical' | 'watch' | 'on-track' | 'completed' | 'pending' | 'internal';

const HEALTH_WEIGHT: Record<HealthTier, number> = {
  critical: 100,
  watch: 50,
  'on-track': 0,
  completed: 0,
  pending: 0,
  internal: 0,
};

export function attentionScore(input: { onHold: number; pendingReview: number; editing: number; health: HealthTier }): number {
  return input.onHold * 3 + input.pendingReview * 2 + input.editing * 0.2 + HEALTH_WEIGHT[input.health];
}

/**
 * First-pass health heuristic — the design handoff references health tiers
 * (critical/watch/on-track/…) throughout but never specifies how to derive
 * one from data; it's treated as already known. This maps it from what we
 * do have: the contract's commercial state plus its fulfilment fraction.
 * Thresholds (40% / 75%) are a starting point, not a spec value — revisit
 * with LBM once real usage shows whether they group clients sensibly.
 */
export function healthTier(input: { contractState: ContractPeriod['state']; fulfilment: number | null }): HealthTier {
  if (input.contractState === 'completed') return 'completed';
  if (input.contractState === 'paused') return 'watch';
  if (input.fulfilment === null) return 'on-track';
  if (input.fulfilment < 0.4) return 'critical';
  if (input.fulfilment < 0.75) return 'watch';
  return 'on-track';
}

// ── Current-period resolution ────────────────────────────────────────────────
// The single canonical rule for "which contract is vigente right now" —
// replaces three ad hoc rules that had drifted apart across the dashboard
// (state === 'active' only), the report (also treated 'extended' as
// current), and client-detail. 'extended' counts as current everywhere now.

const CURRENT_STATES: ReadonlyArray<ContractPeriod['state']> = ['active', 'extended'];

/**
 * Picks the one period that represents "now" for a client with possibly
 * several rows (past renewals, a paused one, etc). Prefers a period whose
 * date range actually covers `now`; if more than one does (shouldn't happen
 * under the app's own overlap validation, but data can predate it), the one
 * with the latest startsOn wins. Falls back to the most recently started
 * active/extended period with no end date. Returns null when the client has
 * no current-state period at all (e.g. only 'completed' rows).
 */
export function resolveCurrentPeriod<T extends Pick<ContractPeriod, 'startsOn' | 'endsOn' | 'state'>>(
  periods: T[],
  now: Date,
): T | null {
  const eligible = periods.filter(p => CURRENT_STATES.includes(p.state));
  if (eligible.length === 0) return null;

  const covering = eligible.filter(p => {
    const starts = new Date(p.startsOn);
    const ends = p.endsOn ? new Date(p.endsOn) : null;
    return starts <= now && (!ends || ends >= now);
  });
  const pool = covering.length > 0 ? covering : eligible;

  return pool.reduce((latest, p) => (new Date(p.startsOn) > new Date(latest.startsOn) ? p : latest));
}

/** Every period (any state) whose [startsOn, endsOn] range includes `month` (YYYY-MM) — unifies logic that used to be duplicated per view. */
export function findPeriodCoveringMonth<T extends Pick<ContractPeriod, 'startsOn' | 'endsOn'>>(
  periods: T[],
  month: string,
): T[] {
  return periods.filter(p => daysUnderContractInMonth(p, month) > 0);
}

// ── Rolling-cycle anchor (Amendment B) ───────────────────────────────────────

// Minimal shape needed to find "the first published video" — matches the
// same 'posted in socials' + publishDate/dueDate fallback CalendarView
// already uses (components/client/CalendarView.tsx getDisplayDate) so
// "published" means the same thing here as it does on the client calendar.
export interface PublishableVideo {
  status: string;
  publishDate: string | null;
  dueDate: string | null;
}

/**
 * Finds the date a rolling-cycle period's quota clock should start counting
 * from: the earliest publish date, on or after `windowStart` (the period's
 * startsOn), among videos already published. Returns null while the cycle
 * is still waiting for its first publish — callers must not treat null as
 * "starts today," it means "hasn't started."
 */
export function resolveCycleAnchor(videos: PublishableVideo[], windowStart: Date): Date | null {
  const dates = videos
    .filter(v => v.status.toLowerCase().trim() === 'posted in socials')
    .map(v => v.publishDate ?? v.dueDate)
    .filter((d): d is string => !!d)
    .map(d => new Date(d))
    .filter(d => d.getTime() >= windowStart.getTime());
  if (dates.length === 0) return null;
  return dates.reduce((earliest, d) => (d < earliest ? d : earliest));
}

// ── Renewal carry-in ─────────────────────────────────────────────────────────

/** Shortfall from a completed period's contracted total — what a renewal starts already owing. Never negative: over-delivery doesn't carry in as a debt the other way. */
export function computeCarriedIn(contractedTotal: number, delivered: number): number {
  return Math.max(0, contractedTotal - delivered);
}

// ── Expiry / date labels (§7.2) ─────────────────────────────────────────────
// Always computed against the real current date at render — never hardcode
// a reference date, and never memoize this across renders.

export type ExpiryLabel = { text: string; tone: 'red' | 'amber' | 'green' | 'slate' };

export function expiryLabel(period: Pick<ContractPeriod, 'endsOn' | 'state'>, now: Date): ExpiryLabel {
  if (period.state === 'completed') return { text: 'Ended', tone: 'slate' };
  if (!period.endsOn) return { text: 'Active', tone: 'green' };

  const end = new Date(period.endsOn);
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86_400_000);

  if (daysLeft < 0) return { text: `Expired ${Math.abs(daysLeft)}d ago`, tone: 'red' };
  if (daysLeft <= 21) return { text: `Expires in ${daysLeft}d`, tone: 'amber' };
  return { text: `Active · ${daysLeft}d left`, tone: 'green' };
}

// ── Coverage: is enough work in motion to honour what we sold? ──────────────
//
// The account manager's core question, and the one figure no screen computed
// before: percent-delivered cannot distinguish a remainder that is already in
// production from one that does not exist yet. A contract can be 100 videos
// short and read as "62% delivered".
//
//     notStarted = sold − delivered − inPipeline
//
// `inPipeline` is anything in backlog, editing, QC, client review or
// ready-to-post; `delivered` is published. A negative remainder means the
// pipeline exceeds what the contract covers — unbilled work — and is reported
// as `over`, never as a negative count.

export type CoverageStatus = 'short' | 'covered' | 'over';

export interface Coverage {
  sold: number;
  delivered: number;
  inPipeline: number;
  /** Sold but not yet shot, briefed or started. Zero when covered or over. */
  notStarted: number;
  /** Videos in flight beyond what the contract covers. Zero unless status is 'over'. */
  over: number;
  status: CoverageStatus;
}

export function coverage(input: { sold: number; delivered: number; inPipeline: number }): Coverage {
  const { sold, delivered, inPipeline } = input;
  const remainder = sold - delivered - inPipeline;
  return {
    sold,
    delivered,
    inPipeline,
    notStarted: Math.max(0, remainder),
    over: Math.max(0, -remainder),
    status: remainder > 0 ? 'short' : remainder < 0 ? 'over' : 'covered',
  };
}

// ── Term resolution: fixed dates vs rolling cycles ──────────────────────────
//
// A rolling-cycle period (cycleDurationDays set) does not run on its endsOn
// date. Its clock starts when the FIRST video of the cycle is published —
// cycleAnchorDate, set once by the renewals endpoint via resolveCycleAnchor —
// and runs cycleDurationDays from there. Per the schema: once the anchor is
// set, the real end date is always anchor + duration, never endsOn.
//
// Everything that asks "how long is left" must go through resolveTerm, or a
// 30-day contract three days from expiry reads as open-ended.

export type TermKind =
  // Ordinary start/end dates.
  | 'fixed'
  // Open-ended with no cycle: genuinely no deadline.
  | 'open'
  // Rolling cycle, clock running from the first published video.
  | 'cycle'
  // Rolling cycle whose first video has not been published yet, so the
  // countdown has not begun. Not the same as having no deadline.
  | 'cycle-pending';

export interface TermWindow {
  kind: TermKind;
  /** The date the term actually ends. null when open, or a cycle not yet anchored. */
  endsOn: string | null;
  /** Whole days remaining. Negative when the term has run out. null when there is no end date. */
  daysLeft: number | null;
  /** For a cycle: the publish date its clock started from. */
  anchorDate: string | null;
  durationDays: number | null;
}

type TermInput = Pick<ContractPeriod, 'endsOn'> &
  Partial<Pick<ContractPeriod, 'cycleDurationDays' | 'cycleAnchorDate'>>;

const daysBetween = (to: string, now: Date) =>
  Math.ceil((new Date(to).getTime() - now.getTime()) / 86_400_000);

export function resolveTerm(period: TermInput, now: Date): TermWindow {
  const duration = period.cycleDurationDays ?? null;

  if (duration) {
    if (!period.cycleAnchorDate) {
      return { kind: 'cycle-pending', endsOn: null, daysLeft: null, anchorDate: null, durationDays: duration };
    }
    const endsOn = new Date(new Date(period.cycleAnchorDate).getTime() + duration * 86_400_000)
      .toISOString().slice(0, 10);
    return {
      kind: 'cycle',
      endsOn,
      daysLeft: daysBetween(endsOn, now),
      anchorDate: period.cycleAnchorDate,
      durationDays: duration,
    };
  }

  if (!period.endsOn) {
    return { kind: 'open', endsOn: null, daysLeft: null, anchorDate: null, durationDays: null };
  }
  return {
    kind: 'fixed',
    endsOn: period.endsOn,
    daysLeft: daysBetween(period.endsOn, now),
    anchorDate: null,
    durationDays: null,
  };
}

/** The status chip for a term, cycle-aware. Supersedes calling expiryLabel with endsOn alone. */
export function termLabel(term: TermWindow, state: ContractPeriod['state']): ExpiryLabel {
  if (state === 'completed') return { text: 'Ended', tone: 'slate' };
  if (term.kind === 'cycle-pending') {
    return { text: `${term.durationDays}-day cycle · not started`, tone: 'amber' };
  }
  if (term.daysLeft === null) return { text: 'Active', tone: 'green' };
  if (term.daysLeft < 0) return { text: `Expired ${Math.abs(term.daysLeft)}d ago`, tone: 'red' };
  if (term.daysLeft <= 21) return { text: `Expires in ${term.daysLeft}d`, tone: 'amber' };
  return { text: `Active · ${term.daysLeft}d left`, tone: 'green' };
}

export type PaceNeeded =
  // A live term with a deadline: how many per week clears the gap in time.
  | { kind: 'pace'; perWeek: number }
  // Nothing left to start — the contract is covered.
  | { kind: 'covered' }
  // No deadline to divide by (open-ended term), so state the work instead.
  | { kind: 'open'; remaining: number }
  // Expired or absent term: a pace figure is meaningless without a deadline,
  // so the caller renders the contractual problem instead.
  | { kind: 'blocked'; remaining: number }
  // A rolling cycle whose clock has not started: the deadline is known in
  // length but not yet in date, so pace cannot be computed until the first
  // video goes out.
  | { kind: 'cycle-pending'; remaining: number; durationDays: number };

export function paceNeeded(notStarted: number, daysLeft: number | null, hasTerm: boolean): PaceNeeded {
  if (notStarted <= 0) return { kind: 'covered' };
  if (!hasTerm || (daysLeft !== null && daysLeft < 0)) return { kind: 'blocked', remaining: notStarted };
  if (daysLeft === null) return { kind: 'open', remaining: notStarted };
  const weeks = Math.max(1, Math.ceil(daysLeft / 7));
  return { kind: 'pace', perWeek: Math.ceil(notStarted / weeks) };
}
