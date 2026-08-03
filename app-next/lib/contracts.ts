// Shared contract/delivery math — the single source every dashboard and
// report view must call into, per the design handoff's invariants §7.5
// ("one quantity, one source") and §7.5a ("no number typed into prose").
// Never reimplement any of this inline in a component.

import type { ContractPeriod, ContractMonth } from './db/schema';

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
