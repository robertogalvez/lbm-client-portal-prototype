'use client';

import { useState } from 'react';
import { statusColors } from '@/components/ui/StatusBadge';
import { clientStatusLabel } from '@/lib/client-status';
import { deliveryCategory } from '@/lib/pipeline';

export interface CalTask {
  clickupTaskId: string;
  title: string;
  clientFacingTitle: string | null;
  status: string;
  dueDate: string | null;
  dateUpdated: string;
  clientApproval: string | null;
  frameLink: string | null;
  rawDriveLink: string | null;
  publishDate: string | null;
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function displayTitle(clientFacingTitle: string | null, title: string, maxLength = 40): string {
  const display = clientFacingTitle || title;
  return display.length > maxLength ? display.slice(0, maxLength) + '…' : display;
}

// Colors come from the shared statusTone/statusColors mapping in StatusBadge
// (same one the dashboard uses) so a given status reads the same color
// everywhere — this used to be a separate hand-rolled map here that had
// drifted out of sync (e.g. "ready to be posted" was blue here, green
// everywhere else).
function statusStyle(t: CalTask): { color: string; bg: string; label: string } {
  const s = norm(t.status);
  // "Ready to be Posted" / "Posted in Socials" go by deliveryCategory (Publish
  // Date vs. now), not the raw status, so both the label and the color match
  // whether the video has actually gone live yet — see lib/pipeline.ts.
  if (s === 'posted in socials' || s === 'ready to be posted') {
    const isPosted = deliveryCategory(t.status, t.publishDate) === 'posted';
    const { color, bg } = statusColors(isPosted ? 'posted in socials' : 'ready to be posted');
    return { color, bg, label: isPosted ? 'Posted' : 'Ready to post' };
  }
  const { color, bg } = statusColors(t.status);
  if (s === 'for client review') return { color, bg, label: 'Awaiting review' };
  if (s === 'in progress (corrections)') return { color, bg, label: 'In corrections' };
  if (t.clientApproval === 'approved') return { color: '#14805f', bg: '#e4f3ec', label: 'Approved' };
  return { color, bg, label: clientStatusLabel(t.status) };
}

function isInProcess(t: CalTask): boolean {
  const s = norm(t.status);
  return !['posted in socials', 'for client review', 'ready to be posted'].includes(s) && t.clientApproval !== 'approved';
}

// "Ready to be Posted" and "Posted in Socials" are scheduling/publishing
// stages — the date that belongs on the calendar for those is the actual
// scheduled/posted date ("Publish Date (VistaSocial)"), not the editing
// due date or whenever the ClickUp task last happened to be touched.
function getDisplayDate(t: CalTask): string | null {
  const s = norm(t.status);
  if (s === 'ready to be posted' || s === 'posted in socials') return t.publishDate ?? t.dueDate;
  return t.dueDate;
}

function toKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// The calendar is a publishing schedule, not a production tracker — only
// videos that are actually locked in to post (or already posted) belong on
// it. Videos still in editing have due dates too, but showing those made the
// calendar read as "everything with a date" instead of "what's going live
// and when."
function isCalendarEligible(t: CalTask): boolean {
  const s = norm(t.status);
  return s === 'ready to be posted' || s === 'posted in socials';
}

export function CalendarView({ tasks: allTasks }: { tasks: CalTask[] }) {
  const tasks = allTasks.filter(isCalendarEligible);
  const now = new Date();
  const [view, setView] = useState<'month' | 'list'>('month');
  const [current, setCurrent] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);

  const firstOfMonth = new Date(current.year, current.month, 1);
  const lastOfMonth = new Date(current.year, current.month + 1, 0);
  const startPad = firstOfMonth.getDay(); // Sunday = 0
  const totalCells = Math.ceil((startPad + lastOfMonth.getDate()) / 7) * 7;
  const todayKey = toKey(now);
  const monthLabel = firstOfMonth.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Group tasks by date (due date for unpublished, dateUpdated for published)
  const byDate: Record<string, CalTask[]> = {};
  for (const t of tasks) {
    const displayDate = getDisplayDate(t);
    if (!displayDate) continue;
    const k = toKey(new Date(displayDate));
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

  // Upcoming sidebar: next 6 tasks due after today, sorted by date
  const upcomingTasks = tasks
    .filter(t => {
      const displayDate = getDisplayDate(t);
      return displayDate && new Date(displayDate).getTime() > now.getTime() && deliveryCategory(t.status, t.publishDate) !== 'posted';
    })
    .sort((a, b) => new Date(getDisplayDate(a)!).getTime() - new Date(getDisplayDate(b)!).getTime())
    .slice(0, 6);

  // ── List view ─────────────────────────────────────────────
  if (view === 'list') {
    const DAY = 86_400_000;
    const WEEK = 7 * DAY;
    const monday = now.getTime() - ((now.getDay() || 7) - 1) * DAY;
    const weekStart = monday + weekOffset * WEEK;
    const weeks = Array.from({ length: 5 }, (_, i) => weekStart - WEEK + i * WEEK);
    const withDate = tasks.filter(t => getDisplayDate(t)).sort((a, b) => new Date(getDisplayDate(a)!).getTime() - new Date(getDisplayDate(b)!).getTime());

    const weekLabel = new Date(weeks[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' – ' +
                      new Date(weeks[0] + 6 * DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button type="button" aria-label="Previous week" onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#221e18' }}>{weekLabel}</div>
          <button type="button" aria-label="Next week" onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m9 18 6-6-6-6" /></svg>
          </button>
          <ViewToggle view={view} setView={setView} />
        </div>
        {withDate.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9d9488' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
            <p style={{ fontSize: 13, margin: 0 }}>No scheduled videos yet.</p>
          </div>
        ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {weeks.map(ws => {
          const we = ws + WEEK;
          const wt = withDate.filter(t => { const d = new Date(getDisplayDate(t)!).getTime(); return d >= ws && d < we; });
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
                  const displayDate = getDisplayDate(t)!;
                  const due = new Date(displayDate);
                  const overdue = due.getTime() < now.getTime() && deliveryCategory(t.status, t.publishDate) !== 'posted';
                  return (
                    <a key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}?from=calendar`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 12, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ textAlign: 'center', minWidth: 32, flexShrink: 0 }}>
                          <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: overdue ? '#cf3f36' : '#221e18' }}>{due.getDate()}</div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#9d9488', textTransform: 'uppercase' }}>{due.toLocaleString('en-US', { month: 'short' })}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#221e18', lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color, background: bg, padding: '2px 6px', borderRadius: 5, marginTop: 3 }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />{label}
                          </span>
                          {/* Not an <a>/<button>: this sits inside the card's own
                              link, and nesting either is invalid HTML. Reaching it
                              by keyboard needs the card layout changed so this is
                              a sibling of that link rather than a child. */}
                          {isInProcess(t) && t.rawDriveLink && (
                            <span
                              onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(t.rawDriveLink!, '_blank', 'noopener,noreferrer'); }}
                              style={{ display: 'block', marginTop: 3, fontSize: 10.5, fontWeight: 600, color: '#0f6fec', cursor: 'pointer' }}
                            >
                              Raw footage ↗
                            </span>
                          )}
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          );
        })}
        </div>
        )}
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
        <button type="button" aria-label="Previous month" onClick={prevMonth} style={navBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#221e18' }}>{monthLabel}</div>
        <button type="button" aria-label="Next month" onClick={nextMonth} style={navBtn}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="m9 18 6-6-6-6" /></svg>
        </button>
        <ViewToggle view={view} setView={setView} />
      </div>

      {/* Two-column layout on desktop: calendar + upcoming sidebar */}
      <div className="cal-layout">
        <div className="cal-main">
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
                  // Deliberately not role="button": the cell contains per-video
                  // links, and an interactive role here would nest them. Making
                  // day-selection keyboard-reachable means moving the affordance
                  // onto the date number as its own control.
                  onClick={() => setSelectedDay(isSelected ? null : cell.key)}
                  style={{
                    minHeight: 70, padding: '4px 4px 2px', borderRadius: 8, cursor: 'pointer',
                    background: cell.isToday ? '#221e18' : isSelected ? '#fff1e8' : cell.isCurrentMonth ? '#fff' : '#faf6f0',
                    border: `1px solid ${isSelected ? '#FF6000' : '#ece4d8'}`,
                    transition: 'background 100ms',
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2, color: cell.isToday ? '#fff' : cell.isCurrentMonth ? '#221e18' : '#c4bbb0' }}>
                    {cell.date.getDate()}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    {cell.tasks.slice(0, 2).map(t => {
                      const { color, bg } = statusStyle(t);
                      return (
                        <a key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}?from=calendar`} style={{ textDecoration: 'none', color: 'inherit' }} onClick={e => e.stopPropagation()}>
                          <div style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: '1px 3px', borderRadius: 3, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }} title={t.clientFacingTitle || t.title}>
                            {displayTitle(t.clientFacingTitle, t.title, 30)}
                          </div>
                        </a>
                      );
                    })}
                    {cell.tasks.length > 2 && (
                      <div style={{ fontSize: 11, color: '#9d9488', fontWeight: 600 }}>+{cell.tasks.length - 2}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Selected day detail */}
          {selectedDay && (
            <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 14, padding: '14px 14px', marginTop: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#221e18', marginBottom: selectedTasks.length ? 10 : 0 }}>
                {selectedDate?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </div>
              {selectedTasks.length === 0 ? (
                <div style={{ fontSize: 12, color: '#9d9488', marginTop: 6 }}>No videos scheduled for this day.</div>
              ) : selectedTasks.map(t => {
                const { color, bg, label } = statusStyle(t);
                return (
                  <a key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}?from=calendar`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: '1px solid #f0e8df' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#221e18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, color, background: bg, padding: '1px 6px', borderRadius: 5 }}>{label}</span>
                        {/* See the note on the week-view copy above: nested inside
                            the card link, so it cannot be an anchor. */}
                        {isInProcess(t) && t.rawDriveLink && (
                          <span
                            onClick={e => { e.preventDefault(); e.stopPropagation(); window.open(t.rawDriveLink!, '_blank', 'noopener,noreferrer'); }}
                            style={{ display: 'block', marginTop: 3, fontSize: 10.5, fontWeight: 600, color: '#0f6fec', cursor: 'pointer' }}
                          >
                            Raw footage ↗
                          </span>
                        )}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Upcoming sidebar */}
        <div className="cal-sidebar">
          <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 14, padding: '16px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#221e18', marginBottom: 12 }}>Upcoming</div>
            {upcomingTasks.length === 0 ? (
              <div style={{ fontSize: 12, color: '#9d9488' }}>No upcoming videos.</div>
            ) : upcomingTasks.map(t => {
              const { color, bg, label } = statusStyle(t);
              const displayDate = getDisplayDate(t)!;
              const due = new Date(displayDate);
              return (
                <a key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}?from=calendar`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: '1px solid #f0e8df' }}>
                    <div style={{ textAlign: 'center', minWidth: 28, flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1, color: '#221e18' }}>{due.getDate()}</div>
                      <div style={{ fontSize: 9, fontWeight: 600, color: '#9d9488', textTransform: 'uppercase' }}>{due.toLocaleString('en-US', { month: 'short' })}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#221e18', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11, fontWeight: 700, color, background: bg, padding: '1px 5px', borderRadius: 4, marginTop: 2 }}>
                        <span style={{ width: 4, height: 4, borderRadius: '50%', background: color }} />{label}
                      </span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const navBtn: React.CSSProperties = {
  width: 40, height: 40, borderRadius: 8, border: '1px solid #ece4d8',
  background: '#fff', display: 'grid', placeItems: 'center',
  cursor: 'pointer', color: '#6c6357', flexShrink: 0,
};

function ViewToggle({ view, setView }: { view: 'month' | 'list'; setView: (v: 'month' | 'list') => void }) {
  return (
    <div style={{ display: 'inline-flex', background: '#f7f1ea', borderRadius: 8, padding: 2, gap: 1 }}>
      {(['month', 'list'] as const).map(v => (
        <button type="button" key={v} onClick={() => setView(v)} style={{
          padding: '9px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
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
