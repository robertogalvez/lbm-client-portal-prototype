import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isConfigured, MappedTask } from '@/lib/clickup';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { db } from '@/lib/db';
import { authUsers, clients as clientsTable } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { BACKLOG_STATUSES, resolvePostedAt } from '@/lib/portfolio';
import { DashboardTabs, PipelineStage, PipelineStageCounts, PipelinePeriod, PipelinePeriodStat, PipelineClientRow } from '@/components/dashboard/DashboardTabs';

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

const QC_STATUSES = new Set(['tc - qc (somu)', 'qc final - am']);
const PIPELINE_EDITING_STATUSES = new Set(['in progress (editor)', 'in progress (corrections)']);

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
      // tracked separately (see lib/portfolio.ts buildBacklog).
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
  // Only the session-exists check ran here before — a logged-in client-role
  // user could hit this URL directly (the sidebar just hides the link) and
  // see every other client's production data. Same redirect
  // /admin/clients/page.tsx already uses.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

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
  const [taskResult, clientStatusRows] = await Promise.all([
    getDashboardTasks(),
    // Hide Inactive clients (per the synced ClickUp Master Clients List) everywhere
    // on the dashboard by default — a client with no matching record (not yet
    // synced) is kept visible rather than silently hidden.
    db.select({ id: clientsTable.id, name: clientsTable.name, clientStatus: clientsTable.clientStatus })
      .from(clientsTable)
      .catch(() => [] as { id: string; name: string; clientStatus: string | null }[]),
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
      <DashboardTabs
        pipelineStageTotals={pipelineStageTotals}
        pipelineStalledTotals={pipelineStalledTotals}
        pipelinePeriods={pipelinePeriods}
        pipelineClientRows={pipelineClientRows}
        error={error}
      />
    </main>
  );
}
