'use client';

import { useState } from 'react';

export interface EditorStat {
  name: string;
  total: number;
  approved: number;
  inProgress: number;
  onTime: number;
  late: number;
  withDueDate: number;
}

type Tab = 'leaderboard' | 'deadline';

export function TeamPerformance({ editors }: { editors: EditorStat[] }) {
  const [tab, setTab] = useState<Tab>('leaderboard');

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px',
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    color: active ? '#111c28' : '#8b97a4',
    background: active ? '#fff' : 'transparent',
    border: active ? '1px solid #e7ebef' : '1px solid transparent',
    borderRadius: 6,
    cursor: 'pointer',
  });

  if (editors.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#8b97a4', fontSize: 13 }}>
        No editor data — tasks need assignees in ClickUp
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#f4f6f8', padding: 4, borderRadius: 8, width: 'fit-content' }}>
        <button style={tabStyle(tab === 'leaderboard')} onClick={() => setTab('leaderboard')}>Task Leaderboard</button>
        <button style={tabStyle(tab === 'deadline')} onClick={() => setTab('deadline')}>Deadline Accuracy</button>
      </div>

      {tab === 'leaderboard' && (
        <div className="db-tscroll"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e7ebef' }}>
              {['Editor', 'Total', 'Approved', 'In Progress', 'On Time', 'Late'].map(h => (
                <th key={h} style={{ textAlign: h === 'Editor' ? 'left' : 'center', padding: '6px 10px', fontWeight: 600, color: '#8b97a4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editors.sort((a, b) => b.total - a.total).map(e => (
              <tr key={e.name} style={{ borderBottom: '1px solid #f4f6f8' }}>
                <td style={{ padding: '10px 10px', fontWeight: 500, color: '#111c28' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FF6000', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {e.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    {e.name}
                  </div>
                </td>
                <td style={{ textAlign: 'center', padding: '10px 10px', color: '#111c28', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.total}</td>
                <td style={{ textAlign: 'center', padding: '10px 10px', color: '#14805f', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.approved}</td>
                <td style={{ textAlign: 'center', padding: '10px 10px', color: '#2563eb', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.inProgress}</td>
                <td style={{ textAlign: 'center', padding: '10px 10px', color: '#14805f', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.withDueDate > 0 ? `${Math.round(e.onTime / e.withDueDate * 100)}%` : '—'}</td>
                <td style={{ textAlign: 'center', padding: '10px 10px', color: e.late > 0 ? '#cf3f36' : '#8b97a4', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.withDueDate > 0 ? `${Math.round(e.late / e.withDueDate * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}

      {tab === 'deadline' && (
        <div className="db-tscroll"><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e7ebef' }}>
              {['Editor', 'Tasks with Deadline', 'On Time', 'Late', 'On-Time Rate'].map(h => (
                <th key={h} style={{ textAlign: h === 'Editor' ? 'left' : 'center', padding: '6px 10px', fontWeight: 600, color: '#8b97a4', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {editors.filter(e => e.withDueDate > 0).sort((a, b) => b.withDueDate - a.withDueDate).map(e => {
              const rate = Math.round(e.onTime / e.withDueDate * 100);
              return (
                <tr key={e.name} style={{ borderBottom: '1px solid #f4f6f8' }}>
                  <td style={{ padding: '10px 10px', fontWeight: 500, color: '#111c28' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#FF6000', color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {e.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center', padding: '10px 10px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.withDueDate}</td>
                  <td style={{ textAlign: 'center', padding: '10px 10px', color: '#14805f', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.onTime}</td>
                  <td style={{ textAlign: 'center', padding: '10px 10px', color: e.late > 0 ? '#cf3f36' : '#8b97a4', fontWeight: 600, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{e.late}</td>
                  <td style={{ textAlign: 'center', padding: '10px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                      <div style={{ width: 80, height: 7, background: '#e7ebef', borderRadius: 100, overflow: 'hidden' }}>
                        <div style={{ width: `${rate}%`, height: '100%', background: rate >= 70 ? '#14805f' : rate >= 40 ? '#a86a00' : '#cf3f36', borderRadius: 100 }} />
                      </div>
                      <span style={{ color: rate >= 70 ? '#14805f' : rate >= 40 ? '#a86a00' : '#cf3f36', fontWeight: 600, fontSize: 12, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{rate}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {editors.filter(e => e.withDueDate > 0).length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 32, color: '#8b97a4', fontSize: 13 }}>No tasks with due dates assigned to editors</td></tr>
            )}
          </tbody>
        </table></div>
      )}
    </div>
  );
}
