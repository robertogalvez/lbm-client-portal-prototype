import { getTasksFromFolder, getTasksFromList, isConfigured, MappedTask } from '@/lib/clickup';
import { getTasksFromDB } from '@/lib/db/queries';
import { DashboardTabs, ApprovalRow, ClientRow, EditorRow, PipelineStage, AttentionClient, TopEditor, StatusTask, EDITOR_PHASE_COLS } from '@/components/dashboard/DashboardTabs';
import { InfoPopover } from '@/components/ui/Tooltip';

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
  if (range === '30d')  return Date.now() - 30  * 86_400_000;
  if (range === '90d')  return Date.now() - 90  * 86_400_000;
  if (range === '1y')   return Date.now() - 365 * 86_400_000;
  return 0;
}

const PIPELINE_STAGES: { key: string; label: string; group: string; barColor: string; isRework: boolean }[] = [
  { key: 'not ready',                 label: 'Not Ready',                  group: 'To do',          barColor: '#aeb9c6', isRework: false },
  { key: 'backlog',                   label: 'Backlog',                     group: 'To do',          barColor: '#aeb9c6', isRework: false },
  { key: 'not assigned',              label: 'Not Assigned',                group: 'To do',          barColor: '#aeb9c6', isRework: false },
  { key: 'in progress (editor)',      label: 'In Progress (Editor)',        group: 'In progress',    barColor: '#2563eb', isRework: false },
  { key: 'in progress (corrections)', label: 'In Progress (Corrections)',   group: 'In progress',    barColor: '#a86a00', isRework: true  },
  { key: 'tc - qc (somu)',            label: 'TC / QC (Somu)',              group: 'Quality check',  barColor: '#7c66c4', isRework: false },
  { key: 'qc final - am',             label: 'QC Final – AM',               group: 'Quality check',  barColor: '#7c66c4', isRework: false },
  { key: 'for client review',         label: 'For Client Review',           group: 'Review & ship',  barColor: '#FF6000', isRework: false },
  { key: 'ready to be posted',        label: 'Ready to be Posted',          group: 'Review & ship',  barColor: '#14805f', isRework: false },
  { key: 'posted in socials',         label: 'Posted in Socials',           group: 'Review & ship',  barColor: '#14805f', isRework: false },
];

function buildPipeline(tasks: MappedTask[]): PipelineStage[] {
  const counts: Record<string, number> = {};
  for (const t of tasks) counts[norm(t.status)] = (counts[norm(t.status)] ?? 0) + 1;
  return PIPELINE_STAGES.map(s => ({ ...s, count: counts[s.key] ?? 0 }));
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

function buildClients(tasks: MappedTask[]): ClientRow[] {
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
  return Array.from(map.entries())
    .map(([name, s]) => ({ name, ...s }))
    .sort((a, b) => b.total - a.total);
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

interface KpiProps {
  label: string;
  tip: string;
  value: string | number;
  dotColor: string;
  sub?: string;
  subTone?: 'warn' | 'muted';
}

function KpiCard({ label, tip, value, dotColor, sub, subTone }: KpiProps) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, padding: '14px 15px', flex: '1 1 0', minWidth: 140, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 11.5, color: '#54616f', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        {label}
        <InfoPopover tip={tip} />
      </div>
      <div style={{ fontSize: 26, fontWeight: 600, color: '#111c28', lineHeight: 1, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, fontWeight: 600, color: subTone === 'warn' ? '#a86a00' : '#8b97a4', display: 'flex', alignItems: 'center', gap: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
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

  const { range = 'all' } = await searchParams;
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

  const cutoff = rangeCutoff(range);
  const tasks = cutoff > 0
    ? allTasks.filter(t => new Date(t.dateUpdated).getTime() >= cutoff)
    : allTasks;

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

  const POSTED = 'posted in socials';
  const inProduction     = tasks.filter(t => norm(t.status) !== POSTED).length;
  const reviewTasks      = tasks.filter(t => norm(t.status) === 'for client review');
  const pendingApproval  = reviewTasks.length;
  const overdueInReview  = reviewTasks.filter(t => (now - new Date(t.dateUpdated).getTime()) > 3 * DAY_MS);
  const overdueCount     = overdueInReview.length;

  const clientApprovedTasks = tasks.filter(t => t.clientApproval?.toLowerCase() === 'approved');
  const clientApproved      = clientApprovedTasks.length;

  const inCorrectionsTasks = tasks.filter(t => norm(t.status) === 'in progress (corrections)');
  const fpTotal = clientApproved + inCorrectionsTasks.length;
  const firstPassCleanPct = fpTotal > 0 ? Math.round(clientApproved / fpTotal * 100) : null;

  const postedThisMonth = tasks.filter(t => norm(t.status) === POSTED && new Date(t.dateUpdated).getTime() >= monthStart).length;

  const pipeline    = buildPipeline(tasks);
  const approvals   = buildApprovals(tasks);
  const clients     = buildClients(tasks);
  const editors     = buildEditors(tasks);
  const statusTasks: StatusTask[] = tasks.map(t => ({
    id: t.clickupTaskId,
    title: t.title,
    clientName: t.clientName,
    amName: t.assignedAmName,
    status: t.status,
    frameLink: t.frameLink,
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
            {segRanges.map(r => (
              <a
                key={r.value}
                href={`/dashboard?range=${r.value}`}
                style={{
                  fontSize: 12.5, fontWeight: 600, borderRadius: 7, padding: '6px 11px', textDecoration: 'none',
                  background: range === r.value ? '#fff' : 'transparent',
                  color: range === r.value ? '#111c28' : '#54616f',
                  boxShadow: range === r.value ? '0 1px 2px rgba(17,28,40,.08)' : 'none',
                }}
              >
                {r.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Persistent glance zone */}
      <div style={{ padding: '18px 24px 0', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
            ClickUp error: {error}
          </div>
        )}

        {/* Attention banner */}
        {overdueCount > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 15px', borderRadius: 12, background: '#fdedeb', border: '1px solid #f6d6d3' }}>
            <span style={{ width: 32, height: 32, borderRadius: 9, background: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0, color: '#cf3f36' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:17,height:17}}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/></svg>
            </span>
            <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#111c28' }}>
              <span style={{ color: '#cf3f36' }}>{overdueCount} video{overdueCount !== 1 ? 's' : ''}</span> {overdueCount === 1 ? 'has' : 'have'} been awaiting client approval &gt; 3 days
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: '#cf3f36', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}>
              Go to approvals
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </div>
        )}

        {/* KPI row */}
        <div className="db-kpi-grid">
          <KpiCard label="In production"    value={inProduction}    dotColor="#FF6000"  tip="All tasks not yet posted — across every stage from To Do through QC and Review." />
          <KpiCard
            label="Pending approval"
            value={pendingApproval}
            dotColor="#a86a00"
            tip="Videos sitting in 'For Client Review' waiting for client sign-off."
            sub={overdueCount > 0 ? `${overdueCount} overdue >3d` : undefined}
            subTone={overdueCount > 0 ? 'warn' : undefined}
          />
          <KpiCard
            label="First-pass clean"
            value={firstPassCleanPct !== null ? `${firstPassCleanPct}%` : '—'}
            dotColor="#14805f"
            tip="Approved ÷ (Approved + Rework). Higher means fewer revision rounds."
          />
          <KpiCard label="Client-approved"  value={clientApproved}  dotColor="#14805f" tip="Total videos the client has marked Approved, including already-posted ones." />
          <KpiCard label="Posted this month" value={postedThisMonth} dotColor="#2563eb" tip="Videos that reached 'Posted in Socials' during the current calendar month." sub={monthLabel} />
        </div>
      </div>

      {/* Tabbed workspace */}
      <DashboardTabs
        approvals={approvals}
        clients={clients}
        editors={editors}
        pipeline={pipeline}
        attentionClients={attentionClients}
        topEditors={topEditors}
        statusTasks={statusTasks}
        defaultTab={overdueCount > 0 ? 'approvals' : 'overview'}
      />
    </main>
  );
}
