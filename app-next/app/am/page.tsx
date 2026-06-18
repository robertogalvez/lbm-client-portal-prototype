import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import type { MappedTask } from '@/lib/clickup';
import { AmPicker } from '@/components/am/AmPicker';

export const dynamic = 'force-dynamic';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

const STATUS_COLORS: Record<string, string> = {
  'not ready':                  '#8d8d8d',
  'backlog':                    '#8d8d8d',
  'not assigned':               '#8d8d8d',
  'in progress (editor)':       '#1090e0',
  'in progress (corrections)':  '#1090e0',
  'tc - qc (somu)':             '#7C4DFF',
  'qc final - am':              '#7C4DFF',
  'for client review':          '#ffc53d',
  'ready to be posted':         '#20c997',
  'posted in socials':          '#30a46c',
};

function statusColor(s: string) {
  return STATUS_COLORS[norm(s)] ?? '#8d8d8d';
}

function StatusBadge({ status }: { status: string }) {
  const color = statusColor(status);
  const bg = color + '22';
  return (
    <span style={{
      background: bg,
      color,
      fontSize: 11,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 4,
      whiteSpace: 'nowrap',
    }}>
      {status}
    </span>
  );
}

function KpiCard({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e7ebef',
      borderRadius: 10,
      padding: '18px 20px',
      flex: '1 1 0',
      minWidth: 140,
      borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#111c28', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name}`;
}

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysWaiting(dateUpdated: string) {
  return Math.floor((Date.now() - new Date(dateUpdated).getTime()) / 86_400_000);
}

const MINI_PIPELINE = [
  { key: 'not ready',                 label: 'Not Ready',    color: '#8d8d8d' },
  { key: 'backlog',                   label: 'Backlog',       color: '#8d8d8d' },
  { key: 'in progress (editor)',      label: 'In Progress',   color: '#1090e0' },
  { key: 'in progress (corrections)', label: 'Corrections',   color: '#1090e0' },
  { key: 'tc - qc (somu)',            label: 'TC/QC',         color: '#7C4DFF' },
  { key: 'qc final - am',             label: 'QC AM',         color: '#7C4DFF' },
  { key: 'for client review',         label: 'Review',        color: '#ffc53d' },
  { key: 'ready to be posted',        label: 'Ready',         color: '#20c997' },
  { key: 'posted in socials',         label: 'Posted',        color: '#30a46c' },
];

export default async function AmPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const rows = await db
    .select({ amName: authUsers.amName })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const amName = rows[0]?.amName ?? null;

  // Fetch all tasks
  let allTasks: MappedTask[] = [];
  let error: string | null = null;
  try {
    allTasks = await getTasksFromList(process.env.CLICKUP_LIST_ID!, false);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  // Distinct AM names from all tasks
  const allAmNames = [...new Set(
    allTasks.map(t => t.assignedAmName).filter((n): n is string => n !== null)
  )].sort();

  if (!amName) {
    return <AmPicker members={allAmNames} />;
  }

  // Filter to this AM
  const amTasks = allTasks.filter(t => t.assignedAmName === amName);

  const now = Date.now();
  const DAY_MS = 86_400_000;
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const weekEnd = now + 7 * DAY_MS;

  const POSTED_NORM = 'posted in socials';
  const activeTasks = amTasks.filter(t => norm(t.status) !== POSTED_NORM);

  // KPIs
  const activeClients = new Set(activeTasks.map(t => t.clientName).filter(Boolean)).size;
  const inReview = amTasks.filter(t => norm(t.status) === 'for client review').length;
  const dueThisWeek = activeTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() <= weekEnd).length;
  const overdue = activeTasks.filter(t => t.dueDate && new Date(t.dueDate).getTime() < now).length;

  // Client cards
  type ClientData = {
    active: number;
    postedThisMonth: number;
    inReview: number;
    oldestReviewMs: number;
    pipeline: Record<string, number>;
  };
  const clientMap = new Map<string, ClientData>();
  for (const t of amTasks) {
    const cn = t.clientName ?? 'Unknown';
    if (!clientMap.has(cn)) {
      clientMap.set(cn, { active: 0, postedThisMonth: 0, inReview: 0, oldestReviewMs: 0, pipeline: {} });
    }
    const cd = clientMap.get(cn)!;
    const ns = norm(t.status);
    const pk = ns;
    cd.pipeline[pk] = (cd.pipeline[pk] ?? 0) + 1;

    if (ns !== POSTED_NORM) cd.active++;
    if (ns === POSTED_NORM && t.dateUpdated && new Date(t.dateUpdated).getTime() >= monthStart) cd.postedThisMonth++;
    if (ns === 'for client review') {
      cd.inReview++;
      const age = now - new Date(t.dateUpdated).getTime();
      if (age > cd.oldestReviewMs) cd.oldestReviewMs = age;
    }
  }
  const clientEntries = [...clientMap.entries()].sort((a, b) => b[1].active - a[1].active);

  // Needs attention
  const attentionTasks = amTasks.filter(t => {
    const ns = norm(t.status);
    if (ns === 'qc final - am') return true;
    if (ns === 'for client review' && daysWaiting(t.dateUpdated) > 2) return true;
    return false;
  }).sort((a, b) => daysWaiting(b.dateUpdated) - daysWaiting(a.dateUpdated));

  // Due this week
  const dueTasks = activeTasks
    .filter(t => t.dueDate && new Date(t.dueDate).getTime() <= weekEnd)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1400 }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111c28', margin: 0 }}>
          {greeting(amName)}
        </h1>
        <p style={{ fontSize: 13, color: '#8b97a4', margin: '4px 0 0' }}>
          Your client workload · Live from ClickUp
        </p>
      </div>

      {error && (
        <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#cf3f36' }}>
          ClickUp error: {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' }}>
        <KpiCard label="Active Clients"  value={activeClients} accent="#FF6000" sub="clients with open tasks" />
        <KpiCard label="In Review"       value={inReview}      accent="#ffc53d" sub="awaiting client response" />
        <KpiCard label="Due This Week"   value={dueThisWeek}   accent="#1090e0" sub="next 7 days" />
        <KpiCard label="Overdue"         value={overdue}       accent="#e5484d" sub="past due date" />
      </div>

      {/* My Clients grid */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: '0 0 14px' }}>My Clients</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16, marginBottom: 28 }}>
        {clientEntries.map(([clientName, cd]) => {
          const needsAttn = cd.inReview > 0 && cd.oldestReviewMs > 3 * DAY_MS;
          return (
            <div key={clientName} style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, padding: '20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#111c28' }}>{clientName}</div>
                {needsAttn && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#e59700', background: '#fef4e0', padding: '2px 8px', borderRadius: 4 }}>
                    Needs Attention
                  </span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#8b97a4', marginBottom: 2 }}>Active</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#111c28' }}>{cd.active}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#8b97a4', marginBottom: 2 }}>Posted (mo)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#30a46c' }}>{cd.postedThisMonth}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#8b97a4', marginBottom: 2 }}>In Review</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: cd.inReview > 0 ? '#ffc53d' : '#111c28' }}>{cd.inReview}</div>
                </div>
              </div>
              {/* Mini pipeline */}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {MINI_PIPELINE.filter(p => (cd.pipeline[p.key] ?? 0) > 0).map(p => (
                  <div key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.color }} />
                    <span style={{ fontSize: 11, color: '#54616f' }}>{cd.pipeline[p.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Needs My Attention */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: '0 0 14px' }}>Needs My Attention</h2>
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
        {attentionTasks.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: 14, color: '#8b97a4' }}>
            Nothing needs attention right now.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e7ebef', background: '#f8f9fb' }}>
                {['Video Title', 'Client', 'Status', 'Due Date', 'Days Waiting'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#8b97a4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attentionTasks.map(t => (
                <tr key={t.clickupTaskId} style={{ borderBottom: '1px solid #f4f6f8' }}>
                  <td style={{ padding: '10px 16px', fontWeight: 500, color: '#111c28', maxWidth: 300 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  </td>
                  <td style={{ padding: '10px 16px', color: '#54616f' }}>{t.clientName ?? '—'}</td>
                  <td style={{ padding: '10px 16px' }}><StatusBadge status={t.status} /></td>
                  <td style={{ padding: '10px 16px', color: '#54616f' }}>{fmtDate(t.dueDate)}</td>
                  <td style={{ padding: '10px 16px', fontWeight: 700, color: daysWaiting(t.dateUpdated) > 3 ? '#e5484d' : '#111c28' }}>
                    {daysWaiting(t.dateUpdated)}d
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Due This Week */}
      <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: '0 0 14px' }}>Due This Week</h2>
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden' }}>
        {dueTasks.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: 14, color: '#8b97a4' }}>
            No tasks due in the next 7 days.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e7ebef', background: '#f8f9fb' }}>
                {['Video Title', 'Client', 'Status', 'Due Date'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontWeight: 600, color: '#8b97a4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dueTasks.map(t => {
                const isPast = t.dueDate ? new Date(t.dueDate).getTime() < now : false;
                return (
                  <tr key={t.clickupTaskId} style={{ borderBottom: '1px solid #f4f6f8' }}>
                    <td style={{ padding: '10px 16px', fontWeight: 500, color: '#111c28', maxWidth: 300 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                    </td>
                    <td style={{ padding: '10px 16px', color: '#54616f' }}>{t.clientName ?? '—'}</td>
                    <td style={{ padding: '10px 16px' }}><StatusBadge status={t.status} /></td>
                    <td style={{ padding: '10px 16px', fontWeight: isPast ? 700 : 400, color: isPast ? '#e5484d' : '#54616f' }}>
                      {fmtDate(t.dueDate)}
                      {isPast && <span style={{ marginLeft: 6, fontSize: 11, background: '#fdedeb', color: '#e5484d', padding: '1px 6px', borderRadius: 4 }}>Overdue</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

    </main>
  );
}
