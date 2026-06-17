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

function pipelineStats(tasks: MappedTask[]) {
  const counts: Record<string, number> = {};
  for (const t of tasks) {
    counts[t.status] = (counts[t.status] ?? 0) + 1;
  }
  return counts;
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
    // "For Client Review" is a status shared across all lists in the folder
    approvalTasks = allTasks.filter(t =>
      t.status.toLowerCase().replace(/\s+/g, ' ').trim() === 'for client review'
    );
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error fetching tasks';
  }

  const stats = pipelineStats(allTasks);
  const totalInProduction = allTasks.length;

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111c28', margin: 0 }}>Production Overview</h1>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '4px 0 0' }}>
            Live from ClickUp · refreshes every 5 min in production
          </p>
        </div>
        <div style={{ fontSize: 13, color: '#8b97a4', background: '#eceef1', borderRadius: 8, padding: '6px 14px', fontFamily: 'var(--font-mono, monospace)', fontVariantNumeric: 'tabular-nums' }}>
          {totalInProduction} videos in production
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

      {/* Pipeline stats bar */}
      {totalInProduction > 0 && (
        <div style={{
          background: '#fff', border: '1px solid #e7ebef', borderRadius: 10,
          padding: '16px 20px', marginBottom: 24,
          display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
            Pipeline
          </span>
          {PIPELINE_ORDER.filter(s => stats[s]).map(status => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#111c28', fontFamily: 'monospace' }}>
                {stats[status]}
              </span>
            </div>
          ))}
          {/* Any statuses not in the ordered list */}
          {Object.entries(stats)
            .filter(([s]) => !PIPELINE_ORDER.includes(s))
            .map(([status, count]) => (
              <div key={status} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <StatusBadge tone={statusTone(status)}>{status}</StatusBadge>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#111c28', fontFamily: 'monospace' }}>{count}</span>
              </div>
            ))
          }
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
