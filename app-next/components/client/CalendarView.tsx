'use client';

import { useState } from 'react';

export interface CalTask {
  clickupTaskId: string;
  title: string;
  status: string;
  dueDate: string | null;
  clientApproval: string | null;
  frameLink: string | null;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function statusStyle(t: CalTask): { color: string; bg: string; label: string } {
  const s = norm(t.status);
  if (s === 'posted in socials') return { color: '#14805f', bg: '#e4f3ec', label: 'Posted' };
  if (s === 'for client review') return { color: '#b06f06', bg: '#fbeecf', label: 'Awaiting review' };
  if (s === 'ready to be posted') return { color: '#1090e0', bg: '#e6f2fc', label: 'Ready to post' };
  if (t.clientApproval === 'approved') return { color: '#14805f', bg: '#e4f3ec', label: 'Approved' };
  return { color: '#54616f', bg: '#eef1f4', label: t.status };
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function CalendarView({ tasks }: { tasks: CalTask[] }) {
  const now = new Date();
  const [view, setView] = useState<'month' | 'list'>('month');
  const [current, setCurrent] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const firstOfMonth = new Date(current.year, current.month, 1);
  const lastOfMonth = new Date(current.year, current.month + 1, 0);
  const startPad = firstOfMonth.getDay(); // Sunday = 0
  const totalCells = Math.ceil((startPad + lastOfMonth.getDate()) / 7) * 7;
  const todayKey = toKey(now);
  const monthLabel = firstOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Group tasks by due-date key (include ALL tasks with due dates)
  const byDate: Record<string, CalTask[]> = {};
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const k = toKey(new Date(t.dueDate));
    (byDate[k] ??= []).push(t);
  }

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(current.year, current.month, 1 - startPad + i);
    const key = toKey(date);
    return { date, key, isCurrentMonth: date.getMonth() === current.month, isToday: key === todayKey, tasks: byDate[key] ?? [] };
  });

  function prevMonth() {
    setCurrent(c => { const d = new Date(c.year, c.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; });
    setSelectedDay(null);
  }
  function nextMonth() {
    setCurrent(c => { const d = new Date(c.year, c.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; });
    setSelectedDay(null);
  }

  // ── List view ─────────────────────────────────────────────
  if (view === 'list') {
    const DAY = 86_400_000;
    const WEEK = 7 * DAY;
    const monday = now.getTime() - ((now.getDay() || 7) - 1) * DAY;
    const weeks = Array.from({ length: 5 }, (_, i) => monday - WEEK + i * WEEK);
    const withDue = tasks.filter(t => t.dueDate).sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ViewToggle view={view} setView={setView} />
        {withDue.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9d9488' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
            <p style={{ fontSize: 13, margin: 0 }}>No scheduled videos yet.</p>
          </div>
        ) : weeks.map(ws => {
          const we = ws + WEEK;
          const wt = withDue.filter(t => { const d = new Date(t.dueDate!).getTime(); return d >= ws && d < we; });
          if (!wt.length) return null;
          const diff = Math.round((ws - monday) / WEEK);
          const wLabel = diff === 0 ? 'This week' : diff === -1 ? 'Last week' : diff === 1 ? 'Next week'
            : new Date(ws).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' + new Date(we - DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          return (
            <div key={ws} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{wLabel}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {wt.map(t => {
                  const { color, bg, label } = statusStyle(t);
                  const due = new Date(t.dueDate!);
                  const overdue = due.getTime() < now.getTime() && norm(t.status) !== 'posted in socials';
                  return (
                    <div key={t.clickupTaskId} style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ textAlign: 'center', minWidth: 32, flexShrink: 0 }}>
                        <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: overdue ? '#cf3f36' : '#221e18' }}>{due.getDate()}</div>
                        <div style={{ fontSize: 10, fontWeight: 600, color: '#9d9488', textTransform: 'uppercase' }}>{due.toLocaleString('en-US', { month: 'short' })}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#221e18', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color, background: bg, padding: '2px 6px', borderRadius: 5, marginTop: 3 }}>
                          <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />{label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // ── Month grid view ──────────────────────────────────────
  const selectedTasks = selectedDay ? (byDate[selectedDay] ?? []) : [];
  const selectedDate = selectedDay ? new Date(selectedDay + 'T12:00:00') : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={prevMonth} style={navBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#221e18' }}>{monthLabel}</div>
        <button onClick={nextMonth} style={navBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <ViewToggle view={view} setView={setView} />
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#9d9488', padding: '2px 0 4px', letterSpacing: '0.03em' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {cells.map(cell => {
          const isSelected = selectedDay === cell.key;
          return (
            <div
              key={cell.key}
              onClick={() => setSelectedDay(isSelected ? null : cell.key)}
              style={{
                minHeight: 56, padding: '4px 4px 2px', borderRadius: 8, cursor: 'pointer',
                background: cell.isToday ? '#221e18' : isSelected ? '#fff1e8' : cell.isCurrentMonth ? '#fff' : '#faf6f0',
                border: `1px solid ${isSelected ? '#FF6000' : '#ece4d8'}`,
                transition: 'background 100ms',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: cell.isToday ? '#fff' : cell.isCurrentMonth ? '#221e18' : '#c4bbb0' }}>
                {cell.date.getDate()}
              </div>
              {cell.tasks.slice(0, 2).map(t => {
                const { color, bg } = statusStyle(t);
                return (
                  <div key={t.clickupTaskId} style={{ fontSize: 9, fontWeight: 700, color, background: bg, padding: '1px 3px', borderRadius: 3, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>
                    {t.title}
                  </div>
                );
              })}
              {cell.tasks.length > 2 && (
                <div style={{ fontSize: 9, color: '#9d9488', fontWeight: 600 }}>+{cell.tasks.length - 2}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selectedDay && (
        <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 14, padding: '14px 14px', marginTop: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#221e18', marginBottom: selectedTasks.length ? 10 : 0 }}>
            {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          {selectedTasks.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9d9488', marginTop: 6 }}>No videos scheduled for this day.</div>
          ) : selectedTasks.map(t => {
            const { color, bg, label } = statusStyle(t);
            return (
              <div key={t.clickupTaskId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #f0e8df' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: '#221e18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color, background: bg, padding: '1px 6px', borderRadius: 5 }}>{label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: 8, border: '1px solid #ece4d8',
  background: '#fff', display: 'grid', placeItems: 'center',
  cursor: 'pointer', color: '#6c6357', flexShrink: 0,
};

function ViewToggle({ view, setView }: { view: 'month' | 'list'; setView: (v: 'month' | 'list') => void }) {
  return (
    <div style={{ display: 'inline-flex', background: '#f7f1ea', borderRadius: 8, padding: 2, gap: 1 }}>
      {(['month', 'list'] as const).map(v => (
        <button key={v} onClick={() => setView(v)} style={{
          padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
          background: view === v ? '#fff' : 'transparent',
          color: view === v ? '#221e18' : '#9d9488',
          boxShadow: view === v ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
          fontFamily: 'inherit', transition: 'all 120ms',
        }}>
          {v === 'month' ? 'Grid' : 'List'}
        </button>
      ))}
    </div>
  );
}
