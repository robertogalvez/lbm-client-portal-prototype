// One row per client, carrying every number the four admin screens render.
//
// The old portal's most damaging failure was screens disagreeing with each
// other: the dashboard's KPI cards contradicted the table underneath them
// because each computed its own totals. Everything the Dashboard, the Clients
// tabs and the client detail page show now comes out of this one builder, so
// they cannot drift apart.

import type { MappedTask } from '@/lib/clickup';
import {
  coverage, paceNeeded, resolveTerm, termLabel, fulfilment,
  type Coverage, type PaceNeeded, type TermWindow,
} from '@/lib/contracts';
import { matchesClient, resolvePostedAt, type ClientPortfolioInput } from '@/lib/portfolio';
import { fmtCalendarDate } from '@/lib/calendar-date';
import {
  buildStageBuckets, postedCutoffs, norm, POSTED, PIPELINE_STAGE_KEYS,
  type PipelineStageCounts, type PipelinePeriod,
} from '@/lib/pipeline';

export type { ClientPortfolioInput } from '@/lib/portfolio';

/** Filter chips on the Clients → Accounts tab. A row can carry several. */
export type AdminFilterTag = 'expired' | 'nocontract' | 'waiting';

export interface AdminClientRow {
  /** Contract period id when there is one, otherwise the client id. Row keys and links use this. */
  id: string;
  clientId: string;
  /** null for a client with no contract on file — there is nothing to measure coverage against. */
  periodId: string | null;
  name: string;
  initials: string;
  avatarColor: string;

  // Contract
  model: 'retainer' | 'package' | null;
  contractLabel: string;
  termText: string;
  expiryText: string;
  expiryTone: 'red' | 'amber' | 'green' | 'slate';
  termDaysLeft: number | null;
  termExpired: boolean;
  /**
   * How this contract's clock actually works. A rolling cycle runs from the
   * first published video (`anchorDate`), not from `endsOn` — read this rather
   * than the period's dates when showing a deadline.
   */
  term: TermWindow;
  billing: 'retainer' | 'one_time' | null;
  portalUserCount: number;

  // Pipeline (identical buckets on every screen — see lib/pipeline.ts)
  stages: PipelineStageCounts;
  stalledStages: PipelineStageCounts;
  inFlight: number;
  stalledWithUs: number;
  waitingOnClient: number;
  posted: Record<PipelinePeriod, number>;
  /** In flight, but the ClickUp status matched no known stage — see lib/pipeline.ts. */
  unclassified: number;
  unclassifiedStatuses: string[];

  // Coverage (null when there is no contract to measure against)
  coverage: Coverage | null;
  fulfilmentPct: number | null;
  pace: PaceNeeded | null;

  /** Plain language: what this row's owner should actually do. Replaces the status badge. */
  nextAction: string;
  filterTags: AdminFilterTag[];
  /** Higher sorts first. Risk-first ordering: expired → no contract → active. */
  riskScore: number;
}

const AVATAR_COLORS = ['#B4762A', '#8A5A9E', '#5D6773', '#FF6000', '#14805f', '#cf5b53', '#2F5C8F', '#4A5560'];

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

/** Stable per-name colour, so a client looks the same on every screen. */
export function avatarColorOf(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** The term as a person reads it — a rolling cycle names its real window, not "open". */
function termText(p: { startsOn: string; endsOn: string | null }, term: TermWindow): string {
  if (term.kind === 'cycle') return `${fmtCalendarDate(term.anchorDate!)} – ${fmtCalendarDate(term.endsOn!)} · ${term.durationDays}-day cycle`;
  if (term.kind === 'cycle-pending') return `${term.durationDays}-day cycle · starts at first publish`;
  return `${fmtCalendarDate(p.startsOn)} – ${p.endsOn ? fmtCalendarDate(p.endsOn) : 'open'}`;
}

// Every row ends in a next action, not a status badge. Ordered by what
// actually matters most for that client, so the sentence names the single
// biggest problem rather than listing all of them.
function nextActionFor(row: Omit<AdminClientRow, 'nextAction' | 'filterTags' | 'riskScore'>): string {
  const cov = row.coverage;
  const expiredDays = row.termDaysLeft !== null && row.termDaysLeft < 0 ? Math.abs(row.termDaysLeft) : null;

  if (!row.periodId) {
    return row.inFlight > 0
      ? `${row.inFlight} videos in flight with no signed contract — get paper first`
      : 'Onboarded, no contract and no videos yet';
  }
  if (expiredDays !== null && row.inFlight > 0) {
    return `Contract expired ${expiredDays}d ago but ${row.inFlight} videos are still in flight — renew or stop work`;
  }
  if (expiredDays !== null && cov && cov.notStarted > 0) {
    return `${cov.notStarted} of ${cov.sold} sold videos never started and the term ended — renewal call`;
  }
  if (expiredDays !== null) {
    return `Term lapsed ${expiredDays}d ago — renew or close the contract out`;
  }
  if (cov && cov.status === 'over') {
    return `${cov.over} more in flight than the contract covers — unbilled unless the term is renewed`;
  }
  if (row.stalledWithUs > 0 && row.stalledWithUs >= row.waitingOnClient) {
    return `${row.stalledWithUs} stalled with us — clear the edits before the review pile grows`;
  }
  if (row.waitingOnClient > 0) {
    return `${row.waitingOnClient} videos waiting on ${row.name.split(' ')[0]}'s review — nudge`;
  }
  if (cov && cov.notStarted > 0) {
    return `${cov.notStarted} sold and not started — brief or shoot before the term runs out`;
  }
  if (row.inFlight === 0) return 'Nothing in flight — line up the next batch';
  return 'Covered — just keep it moving';
}

export function buildAdminRows(
  clients: ClientPortfolioInput[],
  allTasks: MappedTask[],
  now: Date,
): AdminClientRow[] {
  const nowMs = now.getTime();
  const cutoffs = postedCutoffs(now);

  return clients.map(c => {
    const p = c.period;
    const clientTasks = p
      ? allTasks.filter(t => matchesClient(t, p))
      : allTasks.filter(t => norm(t.clientName ?? '') === norm(c.clientName));

    const buckets = buildStageBuckets(clientTasks, nowMs, cutoffs);

    // Delivered counts what actually went live inside this contract's term —
    // a POSTED task with a future publish date has not happened yet.
    const periodStartMs = p ? new Date(p.startsOn).getTime() : 0;
    const delivered = clientTasks.filter(t => {
      if (norm(t.status) !== POSTED) return false;
      const postedAt = resolvePostedAt(t);
      return postedAt >= periodStartMs && postedAt <= nowMs;
    }).length;

    // Cycle-aware: for a rolling contract the deadline is anchor + duration,
    // never endsOn (see resolveTerm).
    const term: TermWindow = p
      ? resolveTerm(p, now)
      : { kind: 'open', endsOn: null, daysLeft: null, anchorDate: null, durationDays: null };
    const daysLeft = term.daysLeft;
    const termExpired = daysLeft !== null && daysLeft < 0;
    const expiry = p
      ? termLabel(term, p.state)
      : { text: 'No contract yet', tone: 'slate' as const };

    // Sold includes what this contract carried in from a prior period it
    // renewed (§ renewal carry-in) — that shortfall is still owed, not a
    // separate debt the coverage bar leaves out.
    const soldTotal = p ? p.contractedTotal + p.carriedIn : 0;
    const cov = p ? coverage({ sold: soldTotal, delivered, inPipeline: buckets.inFlight }) : null;
    const fulfilmentFrac = p ? fulfilment(delivered, soldTotal) : null;

    const base = {
      id: p ? p.id : c.clientId,
      clientId: c.clientId,
      periodId: p ? p.id : null,
      name: c.clientName,
      initials: initialsOf(c.clientName),
      avatarColor: avatarColorOf(c.clientName),

      model: p ? (p.model === 'package' ? 'package' as const : 'retainer' as const) : null,
      contractLabel: p ? p.label : 'No contract yet',
      termText: p ? termText(p, term) : 'No contract yet',
      expiryText: expiry.text,
      expiryTone: expiry.tone,
      termDaysLeft: daysLeft,
      termExpired,
      term,
      billing: c.billing,
      portalUserCount: c.portalUserCount,

      stages: buckets.counts,
      stalledStages: buckets.stalled,
      inFlight: buckets.inFlight,
      stalledWithUs: buckets.stalledWithUs,
      waitingOnClient: buckets.waitingOnClient,
      posted: buckets.posted,
      unclassified: buckets.unclassified,
      unclassifiedStatuses: buckets.unclassifiedStatuses,

      coverage: cov,
      fulfilmentPct: fulfilmentFrac !== null ? fulfilmentFrac * 100 : null,
      pace: cov
        ? (term.kind === 'cycle-pending' && cov.notStarted > 0
            ? { kind: 'cycle-pending' as const, remaining: cov.notStarted, durationDays: term.durationDays! }
            : paceNeeded(cov.notStarted, daysLeft, !!p && !termExpired))
        : null,
    };

    const filterTags: AdminFilterTag[] = [];
    if (termExpired) filterTags.push('expired');
    if (!p) filterTags.push('nocontract');
    if (buckets.waitingOnClient > 0) filterTags.push('waiting');

    // Risk-first, not alphabetical: an expired term outranks a missing one,
    // which outranks anything merely busy. Within a tier, the bigger blockage.
    const riskScore =
      (termExpired ? 10_000 : 0) +
      (!p ? 5_000 : 0) +
      (cov?.status === 'short' ? cov.notStarted * 10 : 0) +
      buckets.stalledWithUs * 6 +
      buckets.waitingOnClient * 3;

    return { ...base, nextAction: nextActionFor(base), filterTags, riskScore };
  }).sort((a, b) => b.riskScore - a.riskScore || a.name.localeCompare(b.name));
}

export interface AdminTotals {
  stages: PipelineStageCounts;
  stalledStages: PipelineStageCounts;
  inFlight: number;
  stalledWithUs: number;
  waitingOnClient: number;
  /** stalledWithUs + waitingOnClient — the "stuck" headline. */
  stuck: number;
  posted: Record<PipelinePeriod, number>;
  activeClients: number;
  /**
   * In flight, but no client's ClickUp status matched a known stage — see
   * lib/pipeline.ts. `stages` sums only the five known stages, so `inFlight`
   * legitimately exceeds that sum by exactly this number; a screen that
   * shows `stages` as tiles must also show this or its own total will look
   * wrong next to them.
   */
  unclassified: number;
  unclassifiedStatuses: string[];
}

/**
 * Headline numbers, summed straight from the rows the tables render — so the
 * card above a table can never disagree with the table itself.
 */
export function buildAdminTotals(rows: AdminClientRow[]): AdminTotals {
  const sum = (f: (r: AdminClientRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const stages = PIPELINE_STAGE_KEYS.reduce((acc, k) => {
    acc[k] = sum(r => r.stages[k]);
    return acc;
  }, {} as PipelineStageCounts);
  const stalledStages = PIPELINE_STAGE_KEYS.reduce((acc, k) => {
    acc[k] = sum(r => r.stalledStages[k]);
    return acc;
  }, {} as PipelineStageCounts);

  const inFlight = sum(r => r.inFlight);
  const stalledWithUs = sum(r => r.stalledWithUs);
  const waitingOnClient = sum(r => r.waitingOnClient);
  const unclassified = sum(r => r.unclassified);
  const unclassifiedStatuses = Array.from(new Set(rows.flatMap(r => r.unclassifiedStatuses))).sort();

  const totals: AdminTotals = {
    stages,
    stalledStages,
    inFlight,
    stalledWithUs,
    waitingOnClient,
    stuck: stalledWithUs + waitingOnClient,
    posted: {
      today: sum(r => r.posted.today),
      week: sum(r => r.posted.week),
      month: sum(r => r.posted.month),
    },
    activeClients: rows.length,
    unclassified,
    unclassifiedStatuses,
  };

  if (process.env.NODE_ENV !== 'production') {
    const stageSum = PIPELINE_STAGE_KEYS.reduce((s, k) => s + stages[k], 0) + unclassified;
    if (stageSum !== inFlight) {
      console.warn(`[admin-views] in-flight ${inFlight} does not equal the stage columns ${stageSum} — a screen is about to contradict its own table.`);
    }
    if (totals.stuck !== stalledWithUs + waitingOnClient) {
      console.warn('[admin-views] stuck headline does not reconcile with its parts.');
    }
  }

  return totals;
}

/** Coverage roll-up for the Clients → Coverage tab's three summary blocks. */
export function buildCoverageSummary(rows: AdminClientRow[]) {
  const withContract = rows.filter(r => r.coverage !== null);
  const short = withContract.filter(r => r.coverage!.status === 'short');
  const covered = withContract.filter(r => r.coverage!.status === 'covered');
  const over = withContract.filter(r => r.coverage!.status === 'over');
  return {
    shortRows: short,
    coveredRows: covered,
    overRows: over,
    /** Videos sold but not yet shot, briefed or started — the number that becomes a missed deadline. */
    videosNotStarted: short.reduce((s, r) => s + r.coverage!.notStarted, 0),
    videosOver: over.reduce((s, r) => s + r.coverage!.over, 0),
    /** Named in the Coverage footnote — a client producing videos with no paper is itself the finding. */
    noContractRows: rows.filter(r => r.coverage === null),
  };
}
