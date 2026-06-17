import { getActiveTasks, isConfigured, MappedTask } from '@/lib/clickup';

import { VideoTable } from '@/components/videos/VideoTable';

function groupByStatus(tasks: MappedTask[]) {
  return tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});
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
CLICKUP_LIST_ID=your_list_id_here`}
          </pre>
        </div>
      </main>
    );
  }

  let tasks: MappedTask[] = [];
  let error: string | null = null;

  try {
    tasks = await getActiveTasks();
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error fetching tasks';
  }

  const byStatus = groupByStatus(tasks);

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1280 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111c28', margin: 0 }}>Active Videos</h1>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '4px 0 0' }}>
            Live from ClickUp · refreshes every 5 min in production
          </p>
        </div>
        <div style={{ fontSize: 13, color: '#8b97a4', background: '#eceef1', borderRadius: 8, padding: '6px 12px' }}>
          {tasks.length} active
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

      {/* Status summary pills */}
      {Object.keys(byStatus).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {Object.entries(byStatus).map(([status, count]) => (
            <span key={status} style={{
              background: '#eceef1', borderRadius: 6, padding: '4px 10px',
              fontSize: 12.5, color: '#54616f', fontWeight: 500,
            }}>
              {status} <strong style={{ color: '#111c28' }}>{count}</strong>
            </span>
          ))}
        </div>
      )}

      {/* Table */}
      <div style={{
        background: '#ffffff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden',
      }}>
        <VideoTable tasks={tasks} />
      </div>
    </main>
  );
}
