import { Suspense } from 'react';
import { getTasksFromFolder, getTasksFromList, isConfigured, MappedTask, getClientQuotas, ClientQuota } from '@/lib/clickup';
import { getTasksFromDB } from '@/lib/db/queries';
import { db } from '@/lib/db';
import { clients as clientsTable } from '@/lib/db/schema';
import { DashboardTabs, ApprovalRow, ClientRow, EditorRow, PipelineStage, AttentionClient, TopEditor, StatusTask, AgreedDeliveredRow, BacklogRow, KpiData } from '@/components/dashboard/DashboardTabs';
import { EDITOR_PHASE_COLS } from '@/components/dashboard/editor-phases';
import { FiltersBar } from '@/components/dashboard/FiltersBar';

export const dynamic = 'force-dynamic';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function daysAgo(dateStr: string): number {
  const ts = Number(dateStr);
  const date = isNaN(ts) ? new Date(dateStr) : new Date(ts);
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function rangeCutoff(range: string): number {
  if (range === 'month') {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  if (range === '30d')  return Date.now() - 30  * 86_400_000;
  if (range === '90d')  return Date.now() - 90  * 86_400_000;
  if (range === '1y')   return Date.now() - 365 * 86_400_000;
  return 0;
}

// The equal-length window immediately preceding `cutoff`, used to compute
// KPI trend deltas. 'all' has no meaningful "prior" window.
function previousWindowBounds(range: string, cutoff: number): [number, number] | null {
  if (range === 'month') {
    const d = new Date(cutoff);
    const prevMonth = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const currMonth = new Date(cutoff);
    return [prevMonth.getTime(), currMonth.getTime()];
  }
  if (range === '30d')  return [cutoff - 30  * 86_400_000, cutoff];
  if (range === '90d')  return [cutoff - 90  * 86_400_000, cutoff];
  if (range === '1y')   return [cutoff - 365 * 86_400_000, cutoff];
  return null;
}

function periodMetrics(list: MappedTask[]) {
  // In production: videos actively being worked on
  const inProdStatuses = new Set([
    'qc final - am',
    'tc - qc (somu)',
    'in progress (corrections)',
    'in progress (editor)',
  ]);
  const inProd = list.filter(t => inProdStatuses.has(norm(t.status))).length;

  // Pending approval: videos in client hands
  const pending = list.filter(t => norm(t.status) === 'for client review').length;

  // Client-approved: READY TO BE POSTED with CLIENT APPROVAL = Approved
  const approved = list.filter(t =>
    norm(t.status) === 'ready to be posted' &&
    t.clientApproval?.toLowerCase() === 'approved'
  ).length;

  // First-pass clean: videos that reached client approval with 0 revisions (never sent back to editor)
  // Denominator: all videos in "ready to be posted" status (some with revisions=0, some with revisions>=1)
  // Numerator: videos in "ready to be posted" with revisions=0 (no corrections needed)
  const readyToPost = list.filter(t => norm(t.status) === 'ready to be posted');
  const cleanPass = readyToPost.filter(t => t.revisions === 0).length;
  const firstPassClean = readyToPost.length > 0 ? Math.round(cleanPass / readyToPost.length * 100) : null;

  return { inProd, pending, approved, firstPassClean };
}

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

const parseDate = (s: string) => { const n = Number(s); return isNaN(n) ? new Date(s).getTime() : n; };

const PIPELINE_STAGES: { key: string; label: string; group: string; barColor: string; isRework: boolean }[] = [
  { key: 'not ready',                 label: 'Not Ready',                  group: 'To do',          barColor: '#aeb9c6', isRework: false },
  { key: 'backlog',                   label: 'Backlog',                     group: 'To do',          barColor: '#aeb9c6', isRework: false },
  { key: 'not assigned',              label: 'Not Assigned',                group: 'To do',          barColor: '#aeb9c6', isRework: false },
  { key: 'in progress (editor)',      label: 'In Progress (Editor)',        group: 'In progress',    barColor: '#2563eb', isRework: false },
  { key: 'in progress (corrections)', label: 'In Progress (Corrections)',   group: 'In progress',    barColor: '#a86a00', isRework: true  },
  { key: 'tc - qc (somu)',            label: 'TC / QC (Somu)',              group: 'Quality check',  barColor: '#7c66c4', isRework: false },
  { key: 'qc final - am',             label: 'QC Final – AM',               group: 'Quality check',  barColor: '#7c66c4', isRework: false },
  { key: 'for client review',         label: 'For Client Review',           group: 'Review & ship',  barColor: '#a86a00', isRework: false },
  { key: 'ready to be posted',        label: 'Ready to be Posted',          group: 'Review & ship',  barColor: '#14805f', isRework: false },
  { key: 'posted in socials',         label: 'Posted in Socials',           group: 'Review & ship',  barColor: '#14805f', isRework: false },
];

function buildPipeline(tasks: MappedTask[]): PipelineStage[] {
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[norm(t.status)] = (counts[norm(t.status)] ?? 0) + 1;
  return PIPELINE_STAGES.map(s => ({ ...s, count: counts[s.key] ?? 0 }));
}

const BACKLOG_STATUSES = new Set(PIPELINE_STAGES.filter(s => s.group === 'To do').map(s => s.key));

function buildBacklog(tasks: MappedTask[]): BacklogRow[] {
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

function buildApprovals(tasks: MappedTask[]): ApprovalRow[] {
  return tasks
    .filter(t => norm(t.status) === 'for client review')
    .map(t => ({
      id: t.clickupTaskId,
      title: t.title,
      clientName: t.clientName,
      amName: t.assignedAmName,
      daysWaiting: daysAgo(t.dateUpdated),
      frameLink: t.frameLink,
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);
}

// `tasks` drives Total/In review/Oldest wait (scoped to whatever range/filters
// are browsed); `monthlyPosted` drives Reels/YouTube delivered — always the
// current calendar month, regardless of the browsed range, since a monthly
// quota promise doesn't mean anything prorated over a different window.
function buildClients(tasks: MappedTask[], monthlyPosted: MappedTask[], quotas: ClientQuota[], backlogRows: BacklogRow[]): ClientRow[] {
  const map = new Map<string, { total: number; inReview: number; oldestDays: number }>();
  for (const t of tasks) {
    const name = t.clientName ?? 'Unknown';
    if (!map.has(name)) map.set(name, { total: 0, inReview: 0, oldestDays: 0 });
    const s = map.get(name)!;
    s.total++;
    if (norm(t.status) === 'for client review') {
      s.inReview++;
      const d = daysAgo(t.dateUpdated);
      if (d > s.oldestDays) s.oldestDays = d;
    }
  }

  const deliveredByName = new Map<string, { reels: number; yt: number }>();
  for (const t of monthlyPosted) {
    const name = t.clientName ?? 'Unknown';
    if (!deliveredByName.has(name)) deliveredByName.set(name, { reels: 0, yt: 0 });
    const d = deliveredByName.get(name)!;
    if (t.isYoutube) d.yt++; else d.reels++;
  }

  const quotaByName = new Map(quotas.map(q => [norm(q.name), q]));
  const backlogByName = new Map(backlogRows.map(b => [norm(b.name), b.backlogCount]));

  return Array.from(map.entries())
    .map(([name, s]) => {
      const delivered = deliveredByName.get(name) ?? { reels: 0, yt: 0 };
      const q = quotaByName.get(norm(name));
      const reelsAgreed = q?.reelsPerMonth ?? 0;
      const ytAgreed = q?.ytPerMonth ?? 0;
      const stillNeeded = Math.max(reelsAgreed - delivered.reels, 0) + Math.max(ytAgreed - delivered.yt, 0);
      const backlogCount = backlogByName.get(norm(name)) ?? 0;
      return {
        name,
        total: s.total,
        inReview: s.inReview,
        oldestDays: s.oldestDays,
        reelsAgreed,
        reelsDelivered: delivered.reels,
        ytAgreed,
        ytDelivered: delivered.yt,
        backlogCount,
        stillNeeded,
        footageGap: stillNeeded - backlogCount,
      };
    })
    .sort((a, b) => b.total - a.total);
}

function buildAgreedVsDelivered(monthlyPosted: MappedTask[], quotas: ClientQuota[]): AgreedDeliveredRow[] {
  const delivered = new Map<string, number>();
  for (const t of monthlyPosted) {
    if (!t.clientName) continue;
    const key = norm(t.clientName);
    delivered.set(key, (delivered.get(key) ?? 0) + 1);
  }

  return quotas
    .map(q => ({ name: q.name, agreed: q.reelsPerMonth + q.ytPerMonth }))
    .filter(q => q.agreed > 0)
    .map(q => ({
      name: q.name,
      agreed: q.agreed,
      delivered: delivered.get(norm(q.name)) ?? 0,
    }))
    .sort((a, b) => b.agreed - a.agreed);
}

function buildEditors(tasks: MappedTask[]): EditorRow[] {
  const phaseKeys = new Set(EDITOR_PHASE_COLS.map(p => p.key));
  const map = new Map<string, { active: number; approved: number; rework: number; phases: Record<string, number> }>();
  for (const t of tasks) {
    const name = t.editorName;
    if (!name) continue;
    if (!map.has(name)) map.set(name, { active: 0, approved: 0, rework: 0, phases: {} });
    const s = map.get(name)!;
    const st = norm(t.status);
    if (st !== 'posted in socials') s.active++;
    if (t.clientApproval?.toLowerCase() === 'approved') s.approved++;
    if (st === 'in progress (corrections)') s.rework++;
    if (phaseKeys.has(st)) s.phases[st] = (s.phases[st] ?? 0) + 1;
  }
  return Array.from(map.entries())
    .map(([name, s]) => {
      const total = s.approved + s.rework;
      const firstPassClean = total > 0 ? Math.round(s.approved / total * 100) : null;
      return { name, ...s, firstPassClean };
    })
    .sort((a, b) => (b.firstPassClean ?? -1) - (a.firstPassClean ?? -1));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; member?: string; am?: string; client?: string; inactive?: string }>;
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

  const { range = 'month', member = '', am = '', client: clientFilter = '', inactive = '' } = await searchParams;
  const showInactive = inactive === '1';
  const masterListId = process.env.CLICKUP_LIST_ID;
  const folderId     = process.env.CLICKUP_FOLDER_ID;
  let allTasks: MappedTask[] = [];
  let error: string | null = null;

  try {
    allTasks = await getTasksFromDB();
    // Fall back to live ClickUp if DB is empty
    if (allTasks.length === 0) {
      if (masterListId) {
        allTasks = await getTasksFromList(masterListId, false);
      } else if (folderId) {
        allTasks = await getTasksFromFolder(folderId, false);
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  // Hide Inactive clients (per the synced ClickUp Master Clients List) everywhere
  // on the dashboard by default — a client with no matching record (not yet
  // synced) is kept visible rather than silently hidden.
  const clientStatusRows = await db
    .select({ name: clientsTable.name, clientStatus: clientsTable.clientStatus })
    .from(clientsTable)
    .catch(() => [] as { name: string; clientStatus: string | null }[]);
  const inactiveNames = new Set(
    clientStatusRows.filter(c => c.clientStatus === 'Inactive').map(c => norm(c.name))
  );
  if (!showInactive && inactiveNames.size > 0) {
    allTasks = allTasks.filter(t => !t.clientName || !inactiveNames.has(norm(t.clientName)));
  }

  const clientQuotas = await getClientQuotas().catch(() => [] as ClientQuota[]);

  const cutoff = rangeCutoff(range);

  // Build dropdown lists from the full unfiltered set
  const unique = (arr: (string | null)[]) => [...new Set(arr.filter(Boolean))].sort() as string[];
  const allEditors = unique(allTasks.map(t => t.editorName));
  const allAMs     = unique(allTasks.map(t => t.assignedAmName));
  const allClients = unique(allTasks.map(t => t.clientName));

  const tasks = allTasks
    .filter(t => cutoff === 0 || parseDate(t.dateUpdated) >= cutoff)
    .filter(t => !member       || t.editorName     === member)
    .filter(t => !am           || t.assignedAmName === am)
    .filter(t => !clientFilter || t.clientName     === clientFilter);

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const POSTED = 'posted in socials';
  
  // Use correct periodMetrics calculation for KPI display
  // Status counts should ignore date filters - a video's status doesn't change based on update recency
  const metrics = periodMetrics(allTasks);
  const inProduction = metrics.inProd;
  const pendingApproval = metrics.pending;
  const clientApproved = metrics.approved;
  const firstPassCleanPct = metrics.firstPassClean;

  const reviewTasks      = tasks.filter(t => norm(t.status) === 'for client review');
  const overdueInReview  = reviewTasks.filter(t => (now - parseDate(t.dateUpdated)) > 3 * DAY_MS);
  const overdueCount     = overdueInReview.length;

  const clientApprovedTasks = tasks.filter(t => norm(t.status) === 'ready to be posted' && t.clientApproval?.toLowerCase() === 'approved');
  const inCorrectionsTasks = tasks.filter(t => norm(t.status) === 'in progress (corrections)');

  // Quota pacing (Delivery/Footage) and the "Posted this month" KPI are both
  // always scoped to the current calendar month, independent of the browsed
  // range — a monthly quota (or "this month" label) doesn't mean anything
  // prorated over a different window.
  const monthlyPosted = allTasks
    .filter(t => norm(t.status) === POSTED && parseDate(t.dateUpdated) >= monthStart)
    .filter(t => !member       || t.editorName     === member)
    .filter(t => !am           || t.assignedAmName === am)
    .filter(t => !clientFilter || t.clientName     === clientFilter);

  const postedThisMonth = monthlyPosted.length;

  const pipeline    = buildPipeline(allTasks);
  const approvals   = buildApprovals(allTasks);
  const backlogRows = buildBacklog(allTasks);
  const clients     = buildClients(tasks, monthlyPosted, clientQuotas, backlogRows);
  const editors     = buildEditors(tasks);
  const agreedVsDelivered = buildAgreedVsDelivered(monthlyPosted, clientQuotas);
  const statusTasks: StatusTask[] = allTasks.map(t => ({
    id: t.clickupTaskId,
    title: t.title,
    clientName: t.clientName,
    amName: t.assignedAmName,
    status: t.status,
    frameLink: t.frameLink,
    instagramUrl: t.instagramUrl,
  }));

  const attentionClients: AttentionClient[] = clients
    .filter(c => c.inReview > 0 && c.oldestDays > 3)
    .map(c => ({ name: c.name, daysWaiting: c.oldestDays }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);

  const topEditors: TopEditor[] = editors
    .filter(e => e.firstPassClean !== null)
    .slice(0, 3)
    .map(e => ({ name: e.name, firstPassClean: e.firstPassClean! }));

  const monthLabel = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });
  const periodLabel = `${monthLabel} to date`;

  // KPI trend deltas vs. the prior comparable window (skipped for 'All time',
  // which has no meaningful "prior" window).
  const prevBounds = previousWindowBounds(range, cutoff);
  const prevMetrics = prevBounds
    ? periodMetrics(
        allTasks
          .filter(t => { const d = parseDate(t.dateUpdated); return d >= prevBounds[0] && d < prevBounds[1]; })
          .filter(t => !member       || t.editorName     === member)
          .filter(t => !am           || t.assignedAmName === am)
          .filter(t => !clientFilter || t.clientName     === clientFilter)
      )
    : null;

  const prevMonthStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime();
  const postedPrevMonth = allTasks
    .filter(t => norm(t.status) === POSTED)
    .filter(t => { const d = parseDate(t.dateUpdated); return d >= prevMonthStart && d < monthStart; })
    .filter(t => !member       || t.editorName     === member)
    .filter(t => !am           || t.assignedAmName === am)
    .filter(t => !clientFilter || t.clientName     === clientFilter)
    .length;

  const kpis: KpiData[] = [
    {
      label: 'In production', value: inProduction, dotColor: '#FF6000',
      tip: 'All tasks not yet posted — across every stage from To Do through QC and Review.',
      delta: kpiDelta(inProduction, prevMetrics?.inProd, true),
    },
    {
      label: 'Pending approval', value: pendingApproval, dotColor: '#a86a00',
      tip: "Videos sitting in 'For Client Review' waiting for client sign-off.",
      sub: overdueCount > 0 ? `${overdueCount} overdue >3d` : undefined,
      subTone: overdueCount > 0 ? 'warn' : undefined,
      delta: kpiDelta(pendingApproval, prevMetrics?.pending, false),
    },
    {
      label: 'First-pass clean', value: firstPassCleanPct !== null ? `${firstPassCleanPct}%` : '—', dotColor: '#14805f',
      tip: 'Approved ÷ (Approved + currently in Corrections), within this range. A snapshot of current rework load, not a per-task history of revision rounds.',
      delta: firstPassCleanPct !== null ? kpiDelta(firstPassCleanPct, prevMetrics?.firstPassClean, true, 'pts') : undefined,
    },
    {
      label: 'Client-approved', value: clientApproved, dotColor: '#14805f',
      tip: 'Videos the client has marked Approved in this range. Not exclusive of the other tiles — overlaps with In production (not yet posted) and Posted this month.',
      delta: kpiDelta(clientApproved, prevMetrics?.approved, true),
    },
    {
      label: 'Posted this month', value: postedThisMonth, dotColor: '#2563eb',
      tip: "Videos that reached 'Posted in Socials' during the current calendar month.",
      sub: monthLabel,
      delta: kpiDelta(postedThisMonth, postedPrevMonth, true),
    },
  ];

  const segRanges = [
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: '1y',  value: '1y' },
    { label: 'All', value: 'all' },
  ];

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
          <div style={{ display: 'inline-flex', background: '#f5f7f9', border: '1px solid #e7ebef', borderRadius: 9, padding: 3, gap: 2 }}>
            {segRanges.map(r => {
              const params = new URLSearchParams({ range: r.value, ...(member && { member }), ...(am && { am }), ...(clientFilter && { client: clientFilter }) });
              return (
                <a
                  key={r.value}
                  href={`/dashboard?${params}`}
                  style={{
                    fontSize: 12.5, fontWeight: 600, borderRadius: 7, padding: '6px 11px', textDecoration: 'none',
                    background: range === r.value ? '#fff' : 'transparent',
                    color: range === r.value ? '#111c28' : '#54616f',
                    boxShadow: range === r.value ? '0 1px 2px rgba(17,28,40,.08)' : 'none',
                  }}
                >
                  {r.label}
                </a>
              );
            })}
          </div>
          <Suspense fallback={null}>
            <FiltersBar members={allEditors} ams={allAMs} clients={allClients} hideDateRange />
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

      {/* Tabbed workspace (owns the "Needs attention today" panel + KPI row so
          CTAs there can switch tabs client-side). */}
      <DashboardTabs
        kpis={kpis}
        approvals={approvals}
        clients={clients}
        editors={editors}
        pipeline={pipeline}
        attentionClients={attentionClients}
        topEditors={topEditors}
        statusTasks={statusTasks}
        agreedVsDelivered={agreedVsDelivered}
        periodLabel={periodLabel}
        defaultTab='overview'
      />
    </main>
  );
}
