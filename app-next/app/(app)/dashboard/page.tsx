import { getTasksFromFolder, getTasksFromList, isConfigured, MappedTask } from '@/lib/clickup';
import { VideoTable } from '@/components/videos/VideoTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TeamPerformance, EditorStat } from '@/components/dashboard/TeamPerformance';
import { FiltersBar } from '@/components/dashboard/FiltersBar';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { RefreshButton } from '@/components/dashboard/RefreshButton';
import { Suspense } from 'react';

export const dynamic = 'force-dynamic';

// Normalized (lowercase) pipeline stage names — must match exact ClickUp status strings
const PIPELINE_ORDER = [
  'not ready',           // ClickUp: "not ready"  (was "backlog / not ready")
  'backlog',             // ClickUp: "backlog"
  'not assigned',
  'in progress (editor)',
  'in progress (corrections)',
  'tc - qc (somu)',      // ClickUp: "tc - qc (somu)"  (was "quality control – tc / qc")
  'qc final - am',       // ClickUp: "qc final - am"   (hyphen, not en dash)
  'for client review',
  'ready to be posted',
  'posted in socials',
];

// Display labels for pipeline stages
const PIPELINE_LABELS: Record<string, string> = {
  'not ready':              'Not Ready',
  'backlog':                'Backlog',
  'not assigned':           'Not Assigned',
  'in progress (editor)':   'In Progress (Editor)',
  'in progress (corrections)': 'In Progress (Corrections)',
  'tc - qc (somu)':         'TC / QC (Somu)',
  'qc final - am':          'QC Final – AM',
  'for client review':      'For Client Review',
  'ready to be posted':     'Ready to be Posted',
  'posted in socials':      'Posted in Socials',
};

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function pipelineStats(tasks: MappedTask[]) {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    const key = norm(t.status);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function buildEditorStats(tasks: MappedTask[]): EditorStat[] {
  const map = new Map<string, EditorStat>();
  const now = Date.now();
  for (const t of tasks) {
    const name = t.editorName ?? t.assignedAmName;
    if (!name) continue;
    if (!map.has(name)) map.set(name, { name, total: 0, approved: 0, inProgress: 0, onTime: 0, late: 0, withDueDate: 0 });
    const s = map.get(name)!;
    s.total++;
    const st = norm(t.status);
    if (st === 'posted in socials') s.approved++;
    if (st.includes('in progress') || st === 'for client review') s.inProgress++;
    if (t.dueDate) {
      s.withDueDate++;
      const due = new Date(t.dueDate).getTime();
      const updated = new Date(t.dateUpdated).getTime();
      if (st === 'posted in socials') {
        if (updated <= due) s.onTime++; else s.late++;
      } else if (due < now) {
        s.late++;
      }
    }
  }
  return Array.from(map.values());
}

function buildClientStats(tasks: MappedTask[]) {
  const DAY_MS = 86_400_000;
  const map = new Map<string, { total: number; pending: number; oldestPendingMs: number }>();
  const now = Date.now();
  for (const t of tasks) {
    const name = t.clientName ?? 'Unknown';
    if (!map.has(name)) map.set(name, { total: 0, pending: 0, oldestPendingMs: 0 });
    const s = map.get(name)!;
    s.total++;
    if (norm(t.status) === 'for client review') {
      s.pending++;
      const age = now - new Date(t.dateUpdated).getTime();
      if (age > s.oldestPendingMs) s.oldestPendingMs = age;
    }
  }
  return Array.from(map.entries()).map(([name, s]) => ({ name, ...s, DAY_MS })).sort((a, b) => b.total - a.total);
}

function KpiCard({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '18px 20px', flex: '1 1 0', minWidth: 140, borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111c28', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function rangeCutoff(range: string): number {
  if (range === '30d')  return Date.now() - 30  * 86_400_000;
  if (range === '90d')  return Date.now() - 90  * 86_400_000;
  if (range === '365d') return Date.now() - 365 * 86_400_000;
  return 0;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; member?: string; am?: string; client?: string; archived?: string; status?: string }>;
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

  const { range = 'all', member = '', am: amFilter = '', client: clientFilter = '', archived = '', status: statusFilter = '' } = await searchParams;
  const includeArchived = archived === '1';

  // Always prefer the master list (single source of truth) to avoid counting
  // tasks multiple times when they are added to workflow lists in the folder.
  const masterListId = process.env.CLICKUP_LIST_ID;
  const folderId     = process.env.CLICKUP_FOLDER_ID;
  let allTasks: MappedTask[] = [];
  let error: string | null = null;

  try {
    if (masterListId) {
      allTasks = await getTasksFromList(masterListId, includeArchived);
    } else if (folderId) {
      allTasks = await getTasksFromFolder(folderId, includeArchived);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  // Build filter lists from ALL tasks (before filtering)
  const allMembers = [...new Set(allTasks.map(t => t.editorName).filter(Boolean) as string[])].sort();
  const allAMs     = [...new Set(allTasks.map(t => t.assignedAmName).filter(Boolean) as string[])].sort();
  const allClients = [...new Set(allTasks.map(t => t.clientName).filter(Boolean) as string[])].sort();

  // Apply filters
  const cutoff = rangeCutoff(range);
  const tasks = allTasks.filter(t => {
    if (cutoff > 0 && new Date(t.dateUpdated).getTime() < cutoff) return false;
    if (member && t.editorName !== member) return false;
    if (amFilter && t.assignedAmName !== amFilter) return false;
    if (clientFilter && t.clientName !== clientFilter) return false;
    return true;
  });

  const now = Date.now();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const DAY_MS = 86_400_000;

  // "In Production" = active tasks only (excludes posted, archived, discarded)
  const POSTED_NORM = 'posted in socials';
  const totalInProduction = tasks.filter(t => norm(t.status) !== POSTED_NORM).length;
  const pendingApproval   = tasks.filter(t => norm(t.status) === 'for client review').length;
  const readyToPost       = tasks.filter(t => norm(t.status) === 'ready to be posted').length;
  const postedThisMonth   = tasks.filter(t => norm(t.status) === POSTED_NORM && new Date(t.dateUpdated).getTime() >= monthStart).length;

  const postedWithDue = tasks.filter(t => norm(t.status) === 'posted in socials' && t.dueDate);
  const onTimePct = postedWithDue.length > 0
    ? Math.round(postedWithDue.filter(t => new Date(t.dateUpdated) <= new Date(t.dueDate!)).length / postedWithDue.length * 100)
    : null;

  const stats         = pipelineStats(tasks);
  const editorStats   = buildEditorStats(tasks);
  const clientStats   = buildClientStats(tasks);
  const approvalTasks = tasks.filter(t => norm(t.status) === 'for client review');
  const maxPipeline   = Math.max(...PIPELINE_ORDER.map(s => stats[s] ?? 0), 1);

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1400 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111c28', margin: 0 }}>Production Overview</h1>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '4px 0 0' }}>Live from ClickUp · click refresh for latest data</p>
        </div>
        <RefreshButton />
      </div>

      {/* Filters */}
      <Suspense>
        <FiltersBar members={allMembers} ams={allAMs} clients={allClients} />
      </Suspense>

      {error && (
        <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#cf3f36' }}>
          ClickUp error: {error}
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard label="Videos in Production" value={totalInProduction} accent="#FF6000" sub="active tasks" />
        <KpiCard label="Pending Approval"      value={pendingApproval}   accent="#ffc53d" sub="awaiting client review" />
        <KpiCard label="Ready to Post"         value={readyToPost}       accent="#1090e0" sub="scheduled or queued" />
        <KpiCard label="Posted This Month"     value={postedThisMonth}   accent="#30a46c" sub={new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} />
        {onTimePct !== null && (
          <KpiCard label="On-Time Rate" value={`${onTimePct}%`} accent={onTimePct >= 70 ? '#30a46c' : onTimePct >= 40 ? '#ffc53d' : '#e5484d'} sub="completed before due date" />
        )}
      </div>

      {/* Pipeline + Client breakdown */}
      {/* Status donut + Pipeline funnel + Client breakdown */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>

        {/* Status breakdown donut */}
        <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111c28', margin: '0 0 16px' }}>Task Status Breakdown</h2>
          <DonutChart
            total={tasks.length}
            segments={[
              { label: 'To Do',          color: '#8d8d8d', count: (stats['not ready'] ?? 0) + (stats['backlog'] ?? 0) + (stats['not assigned'] ?? 0) },
              { label: 'In Progress',    color: '#1090e0', count: (stats['in progress (editor)'] ?? 0) + (stats['in progress (corrections)'] ?? 0) },
              { label: 'Quality Check',  color: '#7C4DFF', count: (stats['tc - qc (somu)'] ?? 0) + (stats['qc final - am'] ?? 0) },
              { label: 'Client Review',  color: '#ffc53d', count: stats['for client review'] ?? 0 },
              { label: 'Ready to Post',  color: '#20c997', count: stats['ready to be posted'] ?? 0 },
              { label: 'Posted',         color: '#30a46c', count: stats['posted in socials'] ?? 0 },
            ]}
          />
        </div>

        {/* Pipeline funnel — clickable */}
        <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111c28', margin: '0 0 4px' }}>Pipeline Funnel</h2>
          <p style={{ fontSize: 12, color: '#8b97a4', margin: '0 0 14px' }}>Click a stage to see its videos</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PIPELINE_ORDER.map(stage => {
              const count = stats[stage] ?? 0;
              const pct = Math.round(count / maxPipeline * 100);
              const active = statusFilter === stage;
              const params = new URLSearchParams({ range, ...(member && { member }), ...(amFilter && { am: amFilter }), ...(clientFilter && { client: clientFilter }), ...(archived && { archived }) });
              if (!active) params.set('status', stage);
              return (
                <a key={stage} href={`/dashboard?${params}`} style={{ textDecoration: 'none', display: 'block', padding: '6px 8px', borderRadius: 7, background: active ? '#fff4ee' : 'transparent', border: active ? '1px solid #ffd4b8' : '1px solid transparent', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 12, color: active ? '#FF6000' : '#54616f', fontWeight: active ? 700 : 400 }}>{PIPELINE_LABELS[stage] ?? stage}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? '#FF6000' : '#111c28', fontFamily: 'monospace' }}>{count}</span>
                  </div>
                  <div style={{ height: 5, background: '#eceef1', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: active ? '#FF6000' : '#c8d0d8', borderRadius: 3 }} />
                  </div>
                </a>
              );
            })}
          </div>
        </div>

        {/* Client breakdown */}
        <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '20px 24px' }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111c28', margin: '0 0 16px' }}>Client Breakdown</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e7ebef' }}>
                {['Client', 'Total', 'In Review', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: h === 'Client' ? 'left' : 'center', padding: '4px 8px', fontWeight: 600, color: '#8b97a4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientStats.map(c => {
                const stale = c.pending > 0 && c.oldestPendingMs > 3 * DAY_MS;
                return (
                  <tr key={c.name} style={{ borderBottom: '1px solid #f4f6f8' }}>
                    <td style={{ padding: '8px 8px', fontWeight: 500, color: '#111c28' }}>{c.name}</td>
                    <td style={{ textAlign: 'center', padding: '8px 8px', fontWeight: 600, color: '#111c28' }}>{c.total}</td>
                    <td style={{ textAlign: 'center', padding: '8px 8px' }}>
                      {c.pending > 0
                        ? <span style={{ fontWeight: 600, color: stale ? '#e59700' : '#1090e0' }}>{c.pending}</span>
                        : <span style={{ color: '#8b97a4' }}>—</span>}
                    </td>
                    <td style={{ textAlign: 'center', padding: '8px 8px' }}>
                      {c.pending === 0
                        ? <span style={{ fontSize: 11, fontWeight: 600, color: '#30a46c', background: '#e8f5ee', padding: '2px 8px', borderRadius: 4 }}>On Track</span>
                        : stale
                          ? <span style={{ fontSize: 11, fontWeight: 600, color: '#e59700', background: '#fef4e0', padding: '2px 8px', borderRadius: 4 }}>Needs Attention</span>
                          : <span style={{ fontSize: 11, fontWeight: 600, color: '#1090e0', background: '#e6f2fc', padding: '2px 8px', borderRadius: 4 }}>In Review</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Performance */}
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '20px 24px', marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#111c28', margin: '0 0 16px' }}>Team Performance</h2>
        <TeamPerformance editors={editorStats} />
      </div>

      {/* Drill-down table when a pipeline stage is selected */}
      {statusFilter && (() => {
        const drillTasks = tasks.filter(t => norm(t.status) === statusFilter);
        return (
          <div style={{ marginBottom: 24 }}>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>{PIPELINE_LABELS[statusFilter] ?? statusFilter}</h2>
                <p style={{ fontSize: 13, color: '#8b97a4', margin: '2px 0 0' }}>{drillTasks.length} video{drillTasks.length !== 1 ? 's' : ''} in this stage</p>
              </div>
              <a href={`/dashboard?${new URLSearchParams({ range, ...(member && { member }), ...(amFilter && { am: amFilter }), ...(clientFilter && { client: clientFilter }), ...(archived && { archived }) })}`} style={{ fontSize: 13, color: '#8b97a4', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><path d="M18 6 6 18M6 6l12 12"/></svg>
                Clear
              </a>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden' }}>
              <VideoTable tasks={drillTasks} />
            </div>
          </div>
        );
      })()}

      {/* Approval queue — always shown */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>For Client Review</h2>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '2px 0 0' }}>Videos awaiting client approval</p>
        </div>
        <StatusBadge tone="amber">{approvalTasks.length} pending</StatusBadge>
      </div>
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden' }}>
        <VideoTable tasks={approvalTasks} />
      </div>

    </main>
  );
}
