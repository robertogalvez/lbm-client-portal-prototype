import { MappedTask } from '@/lib/clickup';
import { StatusBadge, statusTone } from '@/components/ui/StatusBadge';

function formatDate(ts: string) {
  if (!ts) return '—';
  return new Date(Number(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function VideoTable({ tasks }: { tasks: MappedTask[] }) {
  if (tasks.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: '#8b97a4', fontSize: 14 }}>
        No active videos found in this list.
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #e7ebef' }}>
            {['Title', 'Client', 'Status', 'Video Level', 'AM', 'Updated'].map(h => (
              <th key={h} style={{
                padding: '10px 14px', textAlign: 'left',
                fontSize: 11, fontWeight: 600, color: '#8b97a4',
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map(task => (
            <tr
              key={task.clickupTaskId}
              style={{ borderBottom: '1px solid #e7ebef', transition: 'background 130ms' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f5f7f9')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}
            >
              <td style={{ padding: '11px 14px', fontWeight: 500, color: '#111c28', maxWidth: 320 }}>
                <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {task.title}
                </span>
              </td>
              <td style={{ padding: '11px 14px', color: '#54616f' }}>
                {task.clientName ?? <span style={{ color: '#8b97a4' }}>—</span>}
              </td>
              <td style={{ padding: '11px 14px' }}>
                <StatusBadge tone={statusTone(task.status)}>{task.status}</StatusBadge>
              </td>
              <td style={{ padding: '11px 14px', color: '#54616f' }}>
                {task.videoLevel ?? <span style={{ color: '#8b97a4' }}>—</span>}
              </td>
              <td style={{ padding: '11px 14px', color: '#54616f' }}>
                {task.assignedAmName ?? <span style={{ color: '#8b97a4' }}>—</span>}
              </td>
              <td style={{ padding: '11px 14px', color: '#8b97a4', fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5 }}>
                {formatDate(task.dateUpdated)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
