import { Suspense } from 'react';
import { eq } from 'drizzle-orm';
import { isConfigured, MappedTask } from '@/lib/clickup';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { db } from '@/lib/db';
import { clients as clientsTable, contractPeriods, type ContractPeriod } from '@/lib/db/schema';
import { fulfilment, attentionScore, healthTier, expiryLabel, type HealthTier } from '@/lib/contracts';
import { DashboardTabs, KpiData, PortfolioClientRow, PipelineStage, PipelineStageCounts, PipelinePeriod, PipelinePeriodStat, PipelineClientRow } from '@/components/dashboard/DashboardTabs';
import { InactiveToggle } from '@/components/dashboard/InactiveToggle';

export const revalidate = 60;

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

const parseDate = (s: string) => { const n = Number(s); return isNaN(n) ? new Date(s).getTime() : n; };

const DAY_MS = 86_400_000;
const POSTED = 'posted in socials';

// Delta chip for a KPI card: arrow + magnitude, colored by whether the
// direction is actually good for that metric (e.g. Pending approval going
// up is bad, not good).
function kpiDelta(current: number, previous: number | null | undefined, higherIsGood: boolean, unit: 'count' | 'pts' = 'count') {
  if (previous === null || previous === undefined) return undefined;
  const diff = current - previous;
  if (diff === 0) return undefined;
  const good = (diff > 0) === higherIsGood;
  const arrow = diff > 0 ? '▲' : '▼';
  const magnitude = unit === 'pts' ? `${Math.abs(diff)}pts` : `${Math.abs(diff)}`;
  return { text: `${arrow} ${magnitude}`, good };
}

// Statuses that count as raw, unedited footage on hand ("To do" stage of the
// pipeline) — feeds buildBacklog's footage-supply math AND the pipeline
// analytics "Backlog" stage below, so both agree on what counts as backlog.
const BACKLOG_STATUSES = new Set(['not ready', 'backlog', 'not assigned']);
const QC_STATUSES = new Set(['tc - qc (somu)', 'qc final - am']);
const PIPELINE_EDITING_STATUSES = new Set(['in progress (editor)', 'in progress (corrections)']);

function buildBacklog(tasks: MappedTask[]): { name: string; backlogCount: number }[] {
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

// Statuses counted as "in active editing" for the portfolio's In-flight
// column (Clients section) — merges Editing/QC/Corrections into one bucket,
// unlike the finer-grained pipeline analytics stages below.
const EDITING_STATUSES = new Set(['qc final - am', 'tc - qc (somu)', 'in progress (corrections)', 'in progress (editor)']);

const fmtDate = (d: string | Date) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

interface ContractJoinRow {
  id: string;
  clientName: string;
  label: string;
  startsOn: string;
  endsOn: string | null;
  model: string;
  contractedTotal: number;
  state: ContractPeriod['state'];
}

// Portfolio overview, current-contract mode (§5.2). video_cache has no real
// foreign key to `clients` — its `clientId` is a ClickUp custom-field option
// id, a different id space from `clients.clickupTaskId` (a ClickUp task id).
// Matching by normalized name is what the rest of this file already does
// (see buildBacklog) and is the only reliable join available.
function buildPortfolio(periods: ContractJoinRow[], allTasks: MappedTask[], now: Date): PortfolioClientRow[] {
  return periods.map(p => {
    const clientTasks = allTasks.filter(t => norm(t.clientName ?? '') === norm(p.clientName));
    const periodStartMs = new Date(p.startsOn).getTime();

    // A POSTED task whose publish date is still in the future hasn't
    // actually gone live yet — see resolvePostedAt below — so it doesn't
    // count toward delivered until that date arrives.
    const nowMs = now.getTime();
    const delivered = clientTasks.filter(t => {
      if (norm(t.status) !== POSTED) return false;
      const postedAt = resolvePostedAt(t);
      return postedAt >= periodStartMs && postedAt <= nowMs;
    }).length;
    const inReview = clientTasks.filter(t => norm(t.status) === 'for client review').length;
    const editing = clientTasks.filter(t => EDITING_STATUSES.has(norm(t.status))).length;
    // ClickUp's live status vocabulary here has no "on hold" state (see
    // EDITING_STATUSES — grep confirms none exists), unlike the Excel-only
    // client-ledger reference data. Always 0 until one does.
    const onHold = 0;

    const fulfilmentFrac = fulfilment(delivered, p.contractedTotal);
    const health: HealthTier = healthTier({ contractState: p.state, fulfilment: fulfilmentFrac });
    const expiry = expiryLabel({ endsOn: p.endsOn, state: p.state }, now);

    return {
      id: p.id,
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
    } satisfies PortfolioClientRow;
  }).sort((a, b) => b.attentionScore - a.attentionScore);
}

// ── Pipeline analytics (day / week / month, per client) ─────────────────────
//
// Five in-flight stages partition every non-terminal, non-hidden status
// exactly once (no leaks, no overlaps) — so summing them for any client, or
// across all clients, always equals that client's/the portfolio's true
// in-flight count. "Posted" is the only date-scoped stage: the other five
// describe where a video sits *right now*, which doesn't change depending on
// which period you're looking at.
//
// POSTED_IN_SOCIALS just means the video has been queued into VistaSocial —
// it isn't necessarily live yet. `publishDate` ("Publish Date (VistaSocial)")
// is what actually says when it goes/went live; a POSTED task whose
// publishDate is still in the future hasn't happened yet, so it's folded
// into "Ready to Post" rather than counted as Posted (or silently vanishing
// from the board until its publish date arrives).
const PIPELINE_STAGE_KEYS: PipelineStage[] = ['backlog', 'editing', 'qc', 'review', 'ready'];
const STALL_MS = 3 * DAY_MS; // matches the dashboard's existing >3d "overdue" threshold

function emptyStageCounts(): PipelineStageCounts {
  return { backlog: 0, editing: 0, qc: 0, review: 0, ready: 0 };
}

function pipelineStageOf(normStatus: string): PipelineStage | null {
  if (BACKLOG_STATUSES.has(normStatus)) return 'backlog';
  if (PIPELINE_EDITING_STATUSES.has(normStatus)) return 'editing';
  if (QC_STATUSES.has(normStatus)) return 'qc';
  if (normStatus === 'for client review') return 'review';
  if (normStatus === 'ready to be posted') return 'ready';
  return null; // POSTED, handled separately by the caller
}

// The actual go-live moment for a POSTED task: publishDate when set (the
// source of truth), falling back to dateUpdated for tasks posted before this
// field was tracked, or posted manually outside VistaSocial.
function resolvePostedAt(t: MappedTask): number {
  return t.publishDate ? new Date(t.publishDate).getTime() : parseDate(t.dateUpdated);
}

function buildPipelineClientRows(
  allTasks: MappedTask[],
  now: number,
  postedCutoffs: Record<PipelinePeriod, number>,
): { rows: PipelineClientRow[]; stageTotals: PipelineStageCounts; stalledTotals: PipelineStageCounts; postedTotals: Record<PipelinePeriod, number> } {
  const map = new Map<string, PipelineClientRow>();
  const rowFor = (name: string) => {
    let row = map.get(name);
    if (!row) {
      row = { name, counts: emptyStageCounts(), stalled: emptyStageCounts(), posted: { today: 0, week: 0, month: 0 } };
      map.set(name, row);
    }
    return row;
  };

  for (const t of allTasks) {
    const name = t.clientName ?? 'Unknown';
    const status = norm(t.status);

    if (status === POSTED) {
      const postedAt = resolvePostedAt(t);
      if (postedAt <= now) {
        const row = rowFor(name);
        (Object.keys(postedCutoffs) as PipelinePeriod[]).forEach(p => {
          if (postedAt >= postedCutoffs[p]) row.posted[p]++;
        });
        continue;
      }
      // Scheduled for a future publish date — not live yet, so it still
      // reads as in-flight (Ready to Post) rather than as Posted.
      const row = rowFor(name);
      row.counts.ready++;
      if (now - parseDate(t.dateUpdated) > STALL_MS) row.stalled.ready++;
      continue;
    }

    const stage = pipelineStageOf(status);
    if (stage) {
      const row = rowFor(name);
      row.counts[stage]++;
      // Backlog isn't a "stall" concept — a client's raw-footage supply is
      // tracked separately (buildBacklog / "Footage starved" KPI).
      if (stage !== 'backlog' && now - parseDate(t.dateUpdated) > STALL_MS) row.stalled[stage]++;
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => {
    const totalA = PIPELINE_STAGE_KEYS.reduce((s, k) => s + a.counts[k], 0);
    const totalB = PIPELINE_STAGE_KEYS.reduce((s, k) => s + b.counts[k], 0);
    return totalB - totalA || a.name.localeCompare(b.name);
  });

  // Every total below is summed straight from `rows` — the same numbers the
  // per-client matrix renders — so the pulse strip, the flow strip, and the
  // matrix's own footer can never disagree with each other.
  const stageTotals = PIPELINE_STAGE_KEYS.reduce((acc, k) => {
    acc[k] = rows.reduce((s, r) => s + r.counts[k], 0);
    return acc;
  }, emptyStageCounts());
  const stalledTotals = PIPELINE_STAGE_KEYS.reduce((acc, k) => {
    acc[k] = rows.reduce((s, r) => s + r.stalled[k], 0);
    return acc;
  }, emptyStageCounts());
  const postedTotals: Record<PipelinePeriod, number> = {
    today: rows.reduce((s, r) => s + r.posted.today, 0),
    week:  rows.reduce((s, r) => s + r.posted.week, 0),
    month: rows.reduce((s, r) => s + r.posted.month, 0),
  };

  return { rows, stageTotals, stalledTotals, postedTotals };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  if (!isConfigured()) {
    return (
      <main style={{ padding: 40 }}>
        <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, padding: '48px 40px', maxWidth: 500 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111c28', margin: '0 0 8px' }}>Configure ClickUp credentials</h2>
          <p style={{ fontSize: 14, color: '#54616f', margin: '0 0 20px', lineHeight: 1.6 }}>Set <code>CLICKUP_API_TOKEN</code> and <code>CLICKUP_FOLDER_ID</code> in Netlify environment variables.</p>
        </div>
      </main>
    );
  }

  const { inactive = '' } = await searchParams;
  const showInactive = inactive === '1';
  const [taskResult, clientStatusRows, activeContracts] = await Promise.all([
    getDashboardTasks(),
    // Hide Inactive clients (per the synced ClickUp Master Clients List) everywhere
    // on the dashboard by default — a client with no matching record (not yet
    // synced) is kept visible rather than silently hidden.
    db.select({ id: clientsTable.id, name: clientsTable.name, clientStatus: clientsTable.clientStatus, socialLinks: clientsTable.socialLinks })
      .from(clientsTable)
      .catch(() => [] as { id: string; name: string; clientStatus: string | null; socialLinks: unknown }[]),
    // Portfolio overview data source (§9): contract_periods with state='active',
    // joined to clients for the display name.
    db.select({
        id: contractPeriods.id,
        clientName: clientsTable.name,
        label: contractPeriods.label,
        startsOn: contractPeriods.startsOn,
        endsOn: contractPeriods.endsOn,
        model: contractPeriods.model,
        contractedTotal: contractPeriods.contractedTotal,
        state: contractPeriods.state,
      })
      .from(contractPeriods)
      .innerJoin(clientsTable, eq(contractPeriods.clientId, clientsTable.id))
      .where(eq(contractPeriods.state, 'active'))
      .catch(() => [] as ContractJoinRow[]),
  ]);

  let allTasks = taskResult.tasks;
  const error = taskResult.error;

  const inactiveNames = new Set(
    clientStatusRows.filter(c => c.clientStatus === 'Inactive').map(c => norm(c.name))
  );
  if (!showInactive && inactiveNames.size > 0) {
    allTasks = allTasks.filter(t => !t.clientName || !inactiveNames.has(norm(t.clientName)));
  }

  const now = Date.now();
  const backlogRows   = buildBacklog(allTasks);
  const portfolioRows = buildPortfolio(activeContracts, allTasks, new Date(now));
  const assetRows = clientStatusRows
    .filter(c => showInactive || c.clientStatus !== 'Inactive')
    .map(c => ({ id: c.id, name: c.name, socialLinks: c.socialLinks as Record<string, { handle?: string; url?: string }> | null }));

  const backlogByNameForKpi = new Map(backlogRows.map(b => [norm(b.name), b.backlogCount]));
  const portfolioKpis: KpiData[] = [
    {
      label: 'Active contracts', value: portfolioRows.length, dotColor: '#FF6000',
      tip: 'Count of retainer and package clients with an active contract period.',
    },
    {
      label: 'Needs attention', value: portfolioRows.filter(r => r.health === 'critical' || r.health === 'watch').length, dotColor: '#cf3f36',
      tip: 'Clients whose health is critical or watch.',
    },
    {
      label: 'Pending client review', value: portfolioRows.reduce((sum, r) => sum + r.inReview, 0), dotColor: '#a86a00',
      tip: 'Videos awaiting client approval, summed across active-contract clients.',
    },
    {
      label: 'In active editing', value: portfolioRows.reduce((sum, r) => sum + r.editing, 0), dotColor: '#2563eb',
      tip: 'Videos currently in an editing/QC stage, summed across active-contract clients.',
    },
    {
      label: 'Footage starved', value: portfolioRows.filter(r => (backlogByNameForKpi.get(norm(r.name)) ?? 0) === 0).length, dotColor: '#cf3f36',
      tip: 'Clients with zero raw footage in ClickUp\'s pre-production statuses (Not Ready / Backlog / Not Assigned).',
    },
  ];

  // Period windows for the pipeline analytics section. "Today" and "This
  // month" are calendar-aligned; "This week" is a rolling 7 days — the same
  // convention the dashboard already used for its other rolling ranges.
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const yesterdayStart = todayStart - DAY_MS;
  const weekCutoff = now - 7 * DAY_MS;
  const prevWeekCutoff = weekCutoff - 7 * DAY_MS;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();

  const {
    rows: pipelineClientRows,
    stageTotals: pipelineStageTotals,
    stalledTotals: pipelineStalledTotals,
    postedTotals,
  } = buildPipelineClientRows(allTasks, now, { today: todayStart, week: weekCutoff, month: monthStart });

  const countPostedInWindow = (start: number, end: number) =>
    allTasks.filter(t => norm(t.status) === POSTED)
      .filter(t => { const d = resolvePostedAt(t); return d >= start && d < end; })
      .length;

  const postedPrev = {
    today: countPostedInWindow(yesterdayStart, todayStart),
    week:  countPostedInWindow(prevWeekCutoff, weekCutoff),
    month: countPostedInWindow(prevMonthStart, monthStart),
  };

  const pipelinePeriods: Record<PipelinePeriod, PipelinePeriodStat> = {
    today: { label: 'Today',      posted: postedTotals.today, delta: kpiDelta(postedTotals.today, postedPrev.today, true) },
    week:  { label: 'This week',  posted: postedTotals.week,  delta: kpiDelta(postedTotals.week,  postedPrev.week,  true) },
    month: { label: 'This month', posted: postedTotals.month, delta: kpiDelta(postedTotals.month, postedPrev.month, true) },
  };

  return (
    <main style={{ maxWidth: 1400 }}>
      {/* Topbar */}
      <div className="db-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '15px 24px', borderBottom: '1px solid #e7ebef' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Production Overview</div>
          <div style={{ fontSize: 12.5, color: '#8b97a4', marginTop: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#14805f', fontWeight: 600 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#14805f', display: 'inline-block' }} />
              Live from ClickUp
            </span>
            · cached 60s
          </div>
        </div>
        <div className="db-topbar-right">
          <Suspense fallback={null}>
            <InactiveToggle />
          </Suspense>
        </div>
      </div>

      {/* Persistent glance zone */}
      {error && (
        <div style={{ margin: '18px 24px 0' }}>
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
            ClickUp error: {error}
          </div>
        </div>
      )}

      <DashboardTabs
        pipelineStageTotals={pipelineStageTotals}
        pipelineStalledTotals={pipelineStalledTotals}
        pipelinePeriods={pipelinePeriods}
        pipelineClientRows={pipelineClientRows}
        portfolioKpis={portfolioKpis}
        portfolioRows={portfolioRows}
        assetRows={assetRows}
      />
    </main>
  );
}
