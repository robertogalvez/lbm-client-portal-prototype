import { getTasksFromFolder, isConfigured, MappedTask } from '@/lib/clickup';
import { VideoTable } from '@/components/videos/VideoTable';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';

// Force server-render on every request so env vars are read at runtime, not build time
export const dynamic = 'force-dynamic';

const PIPELINE_ORDER = [
  'Backlog / Not Ready',
  'Not Assigned',
  'In Progress (Editor)',
  'In Progress (Corrections)',
  'Quality Control – TC / QC',
  'QC Final – AM',
  'For Client Review',
  'Ready to be Posted',
  'Posted in Socials',
];

function normalizeStatus(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function pipelineStats(tasks: MappedTask[]) {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }
  return counts;
}

function kpiCounts(tasks: MappedTask[]) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  const pendingApproval = tasks.filter(t => normalizeStatus(t.status) === 'for client review').length;
  const readyToPost = tasks.filter(t => normalizeStatus(t.status) === 'ready to be posted').length;
  const postedThisMonth = tasks.filter(t => {
    if (normalizeStatus(t.status) !== 'posted in socials') return false;
    const updated = t.dateUpdated ? Number(t.dateUpdated) : 0;
    return updated >= monthStart;
  }).length;

  return { total: tasks.length, pendingApproval, readyToPost, postedThisMonth };
}

interface ClientRow {
  clientName: string;
  total: number;
  pendingApproval: number;
  stalePending: boolean; // any "for client review" task not updated in > 3 days
}

function clientBreakdown(tasks: MappedTask[]): ClientRow[] {
  const map: Record<string, ClientRow> = {};
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;

  for (const t of tasks) {
    const name = t.clientName || 'Unknown';
    if (!map[name]) {
      map[name] = { clientName: name, total: 0, pendingApproval: 0, stalePending: false };
    }
    map[name].total += 1;
    if (normalizeStatus(t.status) === 'for client review') {
      map[name].pendingApproval += 1;
      const updated = t.dateUpdated ? Number(t.dateUpdated) : Date.now();
      if (updated < threeDaysAgo) {
        map[name].stalePending = true;
      }
    }
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

export default async function DashboardPage() {
  if (!isConfigured()) {
    return (
      <main style={{ padding: 40 }}>
        <div style={{
          background: '#fff', border: '1px solid #e7ebef', borderRadius: 12,
          padding: '48px 40px', maxWidth: 500,
        }}>
          <div style={{ fontSize: 28, marginBottom: 12 }}>🔑</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111c28', margin: '0 0 8px' }}>
            Configure ClickUp credentials
          </h2>
          <p style={{ fontSize: 14, color: '#54616f', margin: '0 0 20px', lineHeight: 1.6 }}>
            Add the following to your <code style={{ background: '#eef1f4', padding: '1px 5px', borderRadius: 4 }}>.env.local</code>:
          </p>
          <pre style={{
            background: '#eceef1', borderRadius: 8, padding: '14px 16px',
            fontSize: 13, fontFamily: 'monospace', color: '#111c28', margin: 0,
          }}>
{`CLICKUP_API_TOKEN=your_token_here
CLICKUP_FOLDER_ID=your_folder_id_here
CLICKUP_APPROVAL_LIST_ID=your_approval_list_id`}
          </pre>
        </div>
      </main>
    );
  }

  const folderId = process.env.CLICKUP_FOLDER_ID;

  let allTasks: MappedTask[] = [];
  let approvalTasks: MappedTask[] = [];
  let error: string | null = null;

  try {
    allTasks = folderId ? await getTasksFromFolder(folderId) : [];
    approvalTasks = allTasks.filter(t => normalizeStatus(t.status) === 'for client review');
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error fetching tasks';
  }

  const stats = pipelineStats(allTasks);
  const kpi = kpiCounts(allTasks);
  const clients = clientBreakdown(allTasks);
  const maxPipelineCount = Math.max(...Object.values(stats), 1);

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111c28', margin: 0 }}>Production Overview</h1>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '4px 0 0' }}>
            Live from ClickUp · refreshes every 5 min in production
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8,
          padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#cf3f36',
        }}>
          ClickUp error: {error}
        </div>
      )}

      {/* KPI Cards */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28,
      }}>
        {[
          { label: 'Videos in Production', value: kpi.total, accent: '#FF6000' },
          { label: 'Pending Approval', value: kpi.pendingApproval, accent: '#e6a817' },
          { label: 'Ready to Post', value: kpi.readyToPost, accent: '#1a8a5e' },
          { label: 'Posted This Month', value: kpi.postedThisMonth, accent: '#2d6be4' },
        ].map(card => (
          <div key={card.label} style={{
            background: '#fff', border: '1px solid #e7ebef', borderRadius: 12,
            padding: '20px 24px',
            borderTop: `3px solid ${card.accent}`,
          }}>
            <div style={{ fontSize: 13, color: '#8b97a4', marginBottom: 8, fontWeight: 500 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#111c28', fontVariantNumeric: 'tabular-nums' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline Funnel */}
      {allTasks.length > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e7ebef', borderRadius: 10,
          padding: '20px 24px', marginBottom: 28,
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111c28', margin: '0 0 16px' }}>Pipeline Funnel</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PIPELINE_ORDER.filter(s => stats[s]).map(status => {
              const count = stats[status] ?? 0;
              const pct = Math.round((count / maxPipelineCount) * 100);
              return (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 200, flexShrink: 0 }}>
                    <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                  </div>
                  <div style={{ flex: 1, background: '#eceef1', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                    <div style={{
                      width: `${pct}%`, height: '100%',
                      background: '#FF6000', borderRadius: 4,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                  <div style={{ width: 32, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#111c28', fontVariantNumeric: 'tabular-nums' }}>
                    {count}
                  </div>
                </div>
              );
            })}
            {/* Any unlisted statuses */}
            {Object.entries(stats)
              .filter(([s]) => !PIPELINE_ORDER.includes(s))
              .map(([status, count]) => {
                const pct = Math.round((count / maxPipelineCount) * 100);
                return (
                  <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 200, flexShrink: 0 }}>
                      <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                    </div>
                    <div style={{ flex: 1, background: '#eceef1', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: '#FF6000', borderRadius: 4 }} />
                    </div>
                    <div style={{ width: 32, textAlign: 'right', fontSize: 13, fontWeight: 700, color: '#111c28', fontVariantNumeric: 'tabular-nums' }}>
                      {count}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Client Breakdown Table */}
      {clients.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111c28', margin: '0 0 12px' }}>Client Breakdown</h2>
          <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f7f8fa', borderBottom: '1px solid #e7ebef' }}>
                  {['Client', 'Total Videos', 'Pending Approval', 'Status'].map(col => (
                    <th key={col} style={{
                      padding: '10px 16px', textAlign: 'left',
                      fontWeight: 600, color: '#54616f', fontSize: 12,
                      textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((row, i) => (
                  <tr key={row.clientName} style={{
                    borderBottom: i < clients.length - 1 ? '1px solid #eceef1' : 'none',
                  }}>
                    <td style={{ padding: '12px 16px', color: '#111c28', fontWeight: 600 }}>
                      {row.clientName}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#111c28', fontVariantNumeric: 'tabular-nums' }}>
                      {row.total}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#111c28', fontVariantNumeric: 'tabular-nums' }}>
                      {row.pendingApproval > 0 ? (
                        <span style={{
                          background: '#fff8e6', color: '#b07a10', border: '1px solid #f0d080',
                          borderRadius: 6, padding: '2px 8px', fontWeight: 600,
                        }}>
                          {row.pendingApproval}
                        </span>
                      ) : (
                        <span style={{ color: '#8b97a4' }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {row.stalePending ? (
                        <StatusBadge tone="amber">Needs Attention</StatusBadge>
                      ) : row.pendingApproval > 0 ? (
                        <StatusBadge tone="blue">In Review</StatusBadge>
                      ) : (
                        <StatusBadge tone="green">On Track</StatusBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approval queue */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>For Client Review</h2>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '2px 0 0' }}>
            Videos awaiting client approval
          </p>
        </div>
        <StatusBadge tone="amber">{approvalTasks.length} pending</StatusBadge>
      </div>

      <div style={{
        background: '#ffffff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden',
      }}>
        <VideoTable tasks={approvalTasks} />
      </div>
    </main>
  );
}
