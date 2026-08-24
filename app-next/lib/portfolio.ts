// Shared "what does the portfolio look like right now" math — used by the
// unified Clients page's Portfolio view (app/(app)/admin/clients/page.tsx)
// and previously duplicated inline in app/(app)/dashboard/page.tsx before
// that page's own "Clients" tab was folded into the admin Clients page.

import type { MappedTask } from '@/lib/clickup';
import type { ContractPeriod } from '@/lib/db/schema';
import { fulfilment, attentionScore, healthTier, expiryLabel, type HealthTier } from '@/lib/contracts';
import type { KpiData } from '@/components/dashboard/MetricStrip';
import type { PortfolioClientRow } from '@/components/dashboard/PortfolioTable';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function parseDate(s: string) {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}

const POSTED = 'posted in socials';
// Statuses that count as raw, unedited footage on hand — feeds buildBacklog's
// footage-supply math AND (in dashboard/page.tsx) the pipeline analytics
// "Backlog" stage, so both agree on what counts as backlog.
export const BACKLOG_STATUSES = new Set(['not ready', 'backlog', 'not assigned']);
// Statuses counted as "in active editing" for the portfolio's In-flight
// column — merges Editing/QC/Corrections into one bucket, unlike the
// finer-grained pipeline analytics stages in dashboard/page.tsx.
const EDITING_STATUSES = new Set(['qc final - am', 'tc - qc (somu)', 'in progress (corrections)', 'in progress (editor)']);

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// The actual go-live moment for a POSTED task: publishDate when set (the
// source of truth), falling back to dateUpdated for tasks posted before this
// field was tracked, or posted manually outside VistaSocial.
export function resolvePostedAt(t: MappedTask): number {
  return t.publishDate ? new Date(t.publishDate).getTime() : parseDate(t.dateUpdated);
}

export function buildBacklog(tasks: MappedTask[]): { name: string; backlogCount: number }[] {
  const map = new Map<string, number>();
  for (const t of tasks) {
    const name = t.clientName ?? 'Unknown';
    if (!map.has(name)) map.set(name, 0);
    if (BACKLOG_STATUSES.has(norm(t.status))) map.set(name, map.get(name)! + 1);
  }
  return Array.from(map.entries())
    .map(([name, backlogCount]) => ({ name, backlogCount }))
    .sort((a, b) => a.backlogCount - b.backlogCount);
}

export interface ContractJoinRow {
  id: string;
  clientName: string;
  clickupClientOptionId: string | null;
  label: string;
  startsOn: string;
  endsOn: string | null;
  model: string;
  contractedTotal: number;
  state: ContractPeriod['state'];
}

// One entry per client in the whole roster — `period` is null for a client
// with no resolved current contract (a just-synced "Needs setup" client).
// Portfolio is now the single landing view for /admin/clients (folding in
// what used to be the separate Directory tab), so it has to show every
// client, not just ones already under an active/extended contract.
export interface ClientPortfolioInput {
  clientId: string;
  clientName: string;
  billing: 'retainer' | 'one_time' | null;
  portalUserCount: number;
  period: ContractJoinRow | null;
}

// A task belongs to this period's client if the stable ClickUp option id
// matches (the real join — see clients.clickupClientOptionId, added by the
// contract redesign's Decision 3). Falls back to normalized-name matching
// only when the id isn't resolved on one side yet (client not synced since
// the option-id backfill, or the task's own field unset) — never "shows
// nothing" just because the ID isn't populated yet.
export function matchesClient(t: MappedTask, p: Pick<ContractJoinRow, 'clientName' | 'clickupClientOptionId'>): boolean {
  if (p.clickupClientOptionId && t.clientOptionId) return t.clientOptionId === p.clickupClientOptionId;
  return norm(t.clientName ?? '') === norm(p.clientName);
}

// Portfolio overview, current-contract mode — one row per client in the
// roster. A client with no resolved current period gets a 'pending' row
// (health tier `healthTier()` itself never produces, so it's free to mean
// "needs setup" here) instead of being dropped from the list.
export function buildPortfolio(clients: ClientPortfolioInput[], allTasks: MappedTask[], now: Date): PortfolioClientRow[] {
  return clients.map(c => {
    if (!c.period) {
      return {
        id: c.clientId,
        noContractClientId: c.clientId,
        name: c.clientName,
        subtitle: 'No contract yet',
        health: 'pending',
        type: null,
        periodText: '—',
        expiryText: 'No contract yet',
        expiryTone: 'slate',
        delivered: 0,
        contracted: 0,
        fulfilmentPct: null,
        inReview: 0,
        editing: 0,
        onHold: 0,
        attentionScore: -1,
        billing: c.billing,
        portalUserCount: c.portalUserCount,
      } satisfies PortfolioClientRow;
    }

    const p = c.period;
    const clientTasks = allTasks.filter(t => matchesClient(t, p));
    const periodStartMs = new Date(p.startsOn).getTime();

    // A POSTED task whose publish date is still in the future hasn't
    // actually gone live yet — see resolvePostedAt above — so it doesn't
    // count toward delivered until that date arrives.
    const nowMs = now.getTime();
    const delivered = clientTasks.filter(t => {
      if (norm(t.status) !== POSTED) return false;
      const postedAt = resolvePostedAt(t);
      return postedAt >= periodStartMs && postedAt <= nowMs;
    }).length;
    const inReview = clientTasks.filter(t => norm(t.status) === 'for client review').length;
    const editing = clientTasks.filter(t => EDITING_STATUSES.has(norm(t.status))).length;
    // ClickUp's live status vocabulary here has no "on hold" state, unlike
    // the Excel-only client-ledger reference data. Always 0 until one does.
    const onHold = 0;

    const fulfilmentFrac = fulfilment(delivered, p.contractedTotal);
    const health: HealthTier = healthTier({ contractState: p.state, fulfilment: fulfilmentFrac });
    const expiry = expiryLabel({ endsOn: p.endsOn, state: p.state }, now);

    return {
      id: p.id,
      noContractClientId: null,
      name: p.clientName,
      subtitle: p.label,
      health,
      type: p.model === 'package' ? 'package' : 'retainer',
      periodText: `${fmtDate(p.startsOn)} – ${p.endsOn ? fmtDate(p.endsOn) : 'Open'}`,
      expiryText: expiry.text,
      expiryTone: expiry.tone,
      delivered,
      contracted: p.contractedTotal,
      fulfilmentPct: fulfilmentFrac !== null ? fulfilmentFrac * 100 : null,
      inReview,
      editing,
      onHold,
      attentionScore: attentionScore({ onHold, pendingReview: inReview, editing, health }),
      billing: c.billing,
      portalUserCount: c.portalUserCount,
    } satisfies PortfolioClientRow;
  }).sort((a, b) => b.attentionScore - a.attentionScore);
}

export function buildPortfolioKpis(portfolioRows: PortfolioClientRow[], backlogRows: { name: string; backlogCount: number }[]): KpiData[] {
  const backlogByName = new Map(backlogRows.map(b => [norm(b.name), b.backlogCount]));
  const withContract = portfolioRows.filter(r => !r.noContractClientId);
  return [
    {
      label: 'Active contracts', value: withContract.length, dotColor: '#FF6000',
      tip: 'Count of retainer and package clients with an active contract period.',
    },
    {
      label: 'Needs setup', value: portfolioRows.filter(r => r.noContractClientId).length, dotColor: '#b06f06',
      tip: 'Clients synced from ClickUp with no contract period on file yet.',
    },
    {
      label: 'Needs attention', value: withContract.filter(r => r.health === 'critical' || r.health === 'watch').length, dotColor: '#cf3f36',
      tip: 'Clients whose health is critical or watch.',
    },
    {
      label: 'Pending client review', value: withContract.reduce((sum, r) => sum + r.inReview, 0), dotColor: '#a86a00',
      tip: 'Videos awaiting client approval, summed across active-contract clients.',
    },
    {
      label: 'In active editing', value: withContract.reduce((sum, r) => sum + r.editing, 0), dotColor: '#2563eb',
      tip: 'Videos currently in an editing/QC stage, summed across active-contract clients.',
    },
    {
      label: 'Footage starved', value: withContract.filter(r => (backlogByName.get(norm(r.name)) ?? 0) === 0).length, dotColor: '#cf3f36',
      tip: 'Clients with zero raw footage in ClickUp\'s pre-production statuses (Not Ready / Backlog / Not Assigned).',
    },
  ];
}
