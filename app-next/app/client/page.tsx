import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import type { MappedTask } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function getFrameioThumbnail(shareUrl: string): Promise<string | null> {
  try {
    const res = await fetch(shareUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LBMPortal/1.0)' },
      redirect: 'follow',
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function timeAgo(dateUpdated: string) {
  const ts = Number(dateUpdated);
  const d = isNaN(ts) ? new Date(dateUpdated) : new Date(ts);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// Colour for calendar events / upcoming sidebar
function taskEventStyle(task: MappedTask): { color: string; bg: string } {
  const st = norm(task.status);
  if (st === 'for client review') return { color: '#a86a00', bg: '#f8e9c8' };
  if (st === 'posted in socials') return { color: '#14805f', bg: '#e4f3ec' };
  return { color: '#2563eb', bg: '#e8eefc' };
}

// Badge for recently reviewed list
function reviewedBadge(task: MappedTask): { text: string; color: string; bg: string } {
  const ca = (task.clientApproval ?? '').toLowerCase();
  if (ca.includes('change') || ca.includes('request')) return { text: 'Changes sent', color: '#cf3f36', bg: '#fdedeb' };
  if (ca.includes('approved') || norm(task.status) === 'posted in socials') return { text: 'Approved', color: '#14805f', bg: '#e6f4ee' };
  return { text: 'Reviewed', color: '#54616f', bg: '#eef1f4' };
}

const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>
  </svg>
);

const IconVideo = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
    <path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>
  </svg>
);

const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
  </svg>
);


const IconChevLeft = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
    <path d="m15 18-6-6 6-6"/>
  </svg>
);

const IconChevRight = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
    <path d="m9 18 6-6-6-6"/>
  </svg>
);

export default async function ClientPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name, isAlsoClient: authUsers.isAlsoClient })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow || (userRow.role !== 'client' && !userRow.isAlsoClient)) redirect('/dashboard');

  const { clientName, name } = userRow;
  if (!clientName) {
    return (
      <main style={{ minHeight: '100vh', background: '#faf6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
        <div style={{ background: '#fff', borderRadius: 22, padding: '40px 32px', maxWidth: 400, textAlign: 'center', border: '1px solid #ece4d8' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#221e18', margin: '0 0 8px' }}>Account not fully set up</h2>
          <p style={{ fontSize: 14, color: '#6c6357', margin: 0, lineHeight: 1.6 }}>
            Your account hasn&apos;t been linked to a client yet. Please contact your account manager.
          </p>
        </div>
      </main>
    );
  }

  let allTasks: MappedTask[] = [];
  let fetchError: string | null = null;
  try {
    allTasks = await getTasksFromList(process.env.CLICKUP_LIST_ID!, false);
  } catch (e) {
    fetchError = e instanceof Error ? e.message : 'Unknown error';
  }

  const { tab = 'reviews', month } = await searchParams;

  const clientTasks = allTasks.filter(t => t.clientName === clientName);
  const reviewTasks = clientTasks.filter(t => norm(t.status) === 'for client review');
  const postedTasks = clientTasks.filter(t => norm(t.status) === 'posted in socials');
  const inProgress  = clientTasks.filter(t => !['for client review', 'posted in socials'].includes(norm(t.status)));
  const monthStart  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const postedThisMonth = postedTasks.filter(t => new Date(t.dateUpdated).getTime() >= monthStart).length;
  const displayName = (name ?? clientName).split(' ')[0];
  const pct = clientTasks.length > 0 ? Math.round((postedTasks.length / clientTasks.length) * 100) : 0;

  const primaryAm = clientTasks.find(t => t.assignedAmName)?.assignedAmName ?? null;
  const navInitials = initials(clientName);

  // Fetch Frame.io thumbnails for review cards
  const thumbnails: Record<string, string | null> = {};
  await Promise.all(reviewTasks.map(async t => {
    if (t.frameLink) thumbnails[t.clickupTaskId] = await getFrameioThumbnail(t.frameLink);
  }));

  // Calendar data
  let calYear = new Date().getFullYear();
  let calMonthNum = new Date().getMonth();
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const d = new Date(month + '-01');
    if (!isNaN(d.getTime())) { calYear = d.getFullYear(); calMonthNum = d.getMonth(); }
  }
  const calFirstDay = new Date(calYear, calMonthNum, 1);
  const calLastDay  = new Date(calYear, calMonthNum + 1, 0);
  const calStartPad = calFirstDay.getDay();
  const calTotalDays = calLastDay.getDate();
  const calTotalCells = Math.ceil((calStartPad + calTotalDays) / 7) * 7;
  const calMonthLabel = calFirstDay.toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const prevCalDate = new Date(calYear, calMonthNum - 1, 1);
  const nextCalDate = new Date(calYear, calMonthNum + 1, 1);
  const prevCalParam = `${prevCalDate.getFullYear()}-${String(prevCalDate.getMonth() + 1).padStart(2, '0')}`;
  const nextCalParam = `${nextCalDate.getFullYear()}-${String(nextCalDate.getMonth() + 1).padStart(2, '0')}`;

  const tasksByDay: Record<number, MappedTask[]> = {};
  for (const t of clientTasks) {
    if (!t.dueDate) continue;
    const d = new Date(t.dueDate);
    if (d.getFullYear() === calYear && d.getMonth() === calMonthNum) {
      const day = d.getDate();
      tasksByDay[day] = [...(tasksByDay[day] ?? []), t];
    }
  }

  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
  const upcomingTasks = clientTasks
    .filter(t => t.dueDate && new Date(t.dueDate) >= todayDate)
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 10);

  // Mobile tab items
  const tabItems = [
    { label: 'Reviews', badge: reviewTasks.length, active: tab !== 'calendar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg> },
    { label: 'Calendar', badge: 0, active: tab === 'calendar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
  ];

  // Desktop nav shared markup
  const desktopNav = (
    <nav className="cd-nav">
      <div className="cd-nav-inner">
        <div className="cd-nav-left">
          <a href="/client" className="cd-logo">Legacy Media</a>
          <div className="cd-tabs">
            <a href="/client?tab=reviews" className={`cd-tab${tab === 'reviews' || tab === undefined ? ' cd-active' : ''}`}>
              <IconVideo />
              Reviews
              {reviewTasks.length > 0 && <span className="cd-tab-badge">{reviewTasks.length}</span>}
            </a>
            <a href="/client?tab=calendar" className={`cd-tab${tab === 'calendar' ? ' cd-active' : ''}`}>
              <IconCalendar />
              Calendar
            </a>
          </div>
        </div>
        <div className="cd-nav-right">
          <button style={{ width: 36, height: 36, borderRadius: 10, background: 'transparent', border: '1px solid #ece4d8', display: 'grid', placeItems: 'center', color: '#6c6357', cursor: 'pointer' }}>
            <IconBell />
          </button>
          <div style={{ width: 1, height: 24, background: '#ece4d8' }} />
          <span className="cd-client-name">{clientName}</span>
          <div className="cd-avatar">{navInitials}</div>
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* ── MOBILE LAYOUT (hidden on desktop) ─────────────────── */}
      <div className="cd-mobile">
        <main className="cp-shell">
          <div className="cp-frame">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FF6000', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '-0.02em', flexShrink: 0 }}>LBM</div>
                <div>
                  <div style={{ fontSize: 12, color: '#9d9488', fontWeight: 600 }}>Welcome back</div>
                  <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{displayName}</div>
                </div>
              </div>
              <button style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', border: '1px solid #ece4d8', display: 'grid', placeItems: 'center', color: '#6c6357', cursor: 'pointer' }}>
                <IconBell />
              </button>
            </div>

            <div className="cp-body">
              {/* Pipeline banner */}
              <div style={{ background: '#221e18', color: '#fff', borderRadius: 20, padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                    {new Date().toLocaleString('en-US', { month: 'long' }).toUpperCase()} CONTENT
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 2, letterSpacing: '-0.01em' }}>
                    {clientTasks.length} video{clientTasks.length !== 1 ? 's' : ''} in pipeline
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }}>{reviewTasks.length}</div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>to review</div>
                  </div>
                  <div style={{ width: 46, height: 46, borderRadius: '50%', background: `conic-gradient(#FF6000 ${pct}%, rgba(255,255,255,.16) 0)`, display: 'grid', placeItems: 'center' }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#221e18', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, color: '#fff' }}>{postedThisMonth}</div>
                  </div>
                </div>
              </div>

              {fetchError && (
                <div style={{ background: '#fbe7e2', border: '1px solid #f8d0cc', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
                  Error loading content: {fetchError}
                </div>
              )}

              {reviewTasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>
                    Needs your review
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a86a00', background: '#f8e9c8', padding: '2px 9px', borderRadius: 100, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }}>{reviewTasks.length}</span>
                  </div>
                  {reviewTasks.map(t => (
                    <VideoReviewCard key={t.clickupTaskId} task={t} thumbnail={thumbnails[t.clickupTaskId] ?? null} />
                  ))}
                </div>
              )}

              {inProgress.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>In production</div>
                  {inProgress.map(t => (
                    <VideoRow key={t.clickupTaskId} task={t} color="#2563eb" colorBg="#e8eefc" />
                  ))}
                </div>
              )}

              {postedTasks.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0', marginTop: 4 }}>Recently reviewed</div>
                  {postedTasks.slice(0, 8).map(t => (
                    <VideoRow key={t.clickupTaskId} task={t} color="#14805f" colorBg="#e4f3ec" label="Posted" date={fmtDate(t.dateUpdated)} />
                  ))}
                </div>
              )}

              {clientTasks.length === 0 && !fetchError && (
                <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9d9488' }}>
                  <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
                  <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>No videos found for your account yet.</p>
                </div>
              )}
            </div>

            <nav className="cp-tab-bar"><TabItems items={tabItems} /></nav>
            <nav className="cp-tab-bar-desktop"><TabItems items={tabItems} /></nav>
          </div>
        </main>
      </div>

      {/* ── DESKTOP LAYOUT (hidden on mobile) ─────────────────── */}
      <div className="cd-desktop">
        {desktopNav}

        <div className="cd-content">
          {fetchError && (
            <div style={{ background: '#fbe7e2', border: '1px solid #f8d0cc', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
              Error loading content: {fetchError}
            </div>
          )}

          {tab === 'calendar' ? (
            /* ── CALENDAR TAB ── */
            <>
              <div>
                <h1 style={{ fontSize: 25, fontWeight: 800, color: '#221e18', margin: '0 0 4px', letterSpacing: '-0.01em' }}>Publishing calendar</h1>
                <p style={{ fontSize: 14, color: '#6c6357', margin: 0 }}>When your videos go live across channels this month.</p>
              </div>

              <div className="cd-cal-wrap">
                {/* Month grid */}
                <div className="cd-cal-month">
                  <div className="cd-cal-header">
                    <h2 style={{ fontSize: 17, fontWeight: 800, color: '#221e18', margin: 0, letterSpacing: '-0.01em' }}>{calMonthLabel}</h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <a href={`/client?tab=calendar`} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #ece4d8', background: '#fff', fontSize: 13, fontWeight: 500, color: '#6c6357', textDecoration: 'none' }}>Today</a>
                      <a href={`/client?tab=calendar&month=${prevCalParam}`} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #ece4d8', background: '#fff', display: 'grid', placeItems: 'center', color: '#6c6357', textDecoration: 'none' }}><IconChevLeft /></a>
                      <a href={`/client?tab=calendar&month=${nextCalParam}`} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #ece4d8', background: '#fff', display: 'grid', placeItems: 'center', color: '#6c6357', textDecoration: 'none' }}><IconChevRight /></a>
                    </div>
                  </div>
                  <div className="cd-cal-daygrid">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="cd-cal-dh">{d}</div>
                    ))}
                    {Array.from({ length: calTotalCells }, (_, i) => {
                      const dayNum = i - calStartPad + 1;
                      const inCurMonth = dayNum >= 1 && dayNum <= calTotalDays;
                      const todayLocal = new Date();
                      const isToday = inCurMonth &&
                        todayLocal.getDate() === dayNum &&
                        todayLocal.getMonth() === calMonthNum &&
                        todayLocal.getFullYear() === calYear;
                      const events = inCurMonth ? (tasksByDay[dayNum] ?? []) : [];
                      const cellCls = [
                        'cd-cal-cell',
                        !inCurMonth ? 'cd-other-month' : 'cd-cur-month',
                        isToday ? 'cd-today' : '',
                      ].filter(Boolean).join(' ');
                      return (
                        <div key={i} className={cellCls}>
                          <div className="cd-cal-date">{inCurMonth ? dayNum : ''}</div>
                          {events.slice(0, 3).map(t => {
                            const { color, bg } = taskEventStyle(t);
                            return (
                              <Link key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}`} className="cd-cal-pill" style={{ color, background: bg, textDecoration: 'none' }}>
                                {t.title}
                              </Link>
                            );
                          })}
                          {events.length > 3 && <div style={{ fontSize: 10, color: '#9d9488', fontWeight: 600, paddingLeft: 4 }}>+{events.length - 3} more</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Upcoming sidebar */}
                <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 16, overflow: 'hidden' }}>
                  <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid #ece4d8' }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: '#221e18', margin: 0 }}>Upcoming</h3>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {upcomingTasks.length === 0 && (
                      <div style={{ padding: '24px 20px', fontSize: 13, color: '#9d9488', textAlign: 'center' }}>No upcoming videos</div>
                    )}
                    {upcomingTasks.map(t => {
                      const { color, bg } = taskEventStyle(t);
                      const label = norm(t.status) === 'for client review' ? 'Awaiting you'
                        : norm(t.status) === 'posted in socials' ? 'Approved' : 'In production';
                      const due = t.dueDate ? new Date(t.dueDate) : null;
                      return (
                        <Link key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 20px', borderBottom: '1px solid #f0e8df', textDecoration: 'none', color: 'inherit' }}>
                          {due && (
                            <div style={{ textAlign: 'center', minWidth: 36, flexShrink: 0 }}>
                              <div style={{ fontSize: 20, fontWeight: 800, color: '#221e18', lineHeight: 1, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }}>{due.getDate()}</div>
                              <div style={{ fontSize: 10, fontWeight: 600, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>{due.toLocaleString('en-US', { month: 'short' })}</div>
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: '#221e18', lineHeight: 1.3, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, color, background: bg }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color }} />
                              {label}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ── REVIEWS TAB ── */
            <>
              {/* Welcome + AM */}
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
                  <h1 style={{ fontSize: 25, fontWeight: 800, color: '#221e18', margin: 0, letterSpacing: '-0.01em' }}>
                    Welcome back, {clientName}
                  </h1>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#6c6357', background: '#fff', border: '1px solid #ece4d8', padding: '5px 12px', borderRadius: 8, flexShrink: 0, marginTop: 4 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13,color:'#14805f'}}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    Secure client access
                  </span>
                </div>
                <p style={{ fontSize: 14, color: '#6c6357', margin: '0 0 4px' }}>
                  Review and approve your videos. Approvals sync straight back to your team at Legacy.
                </p>
                {primaryAm && (
                  <p style={{ fontSize: 13, color: '#9d9488', margin: 0 }}>
                    Account Manager: <span style={{ color: '#6c6357', fontWeight: 600 }}>{primaryAm}</span>
                  </p>
                )}
              </div>

              {/* Pipeline banner */}
              <div style={{ background: '#221e18', color: '#fff', borderRadius: 20, padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                  <div style={{ width: 60, height: 60, borderRadius: '50%', background: `conic-gradient(#FF6000 ${pct}%, rgba(255,255,255,.15) 0)`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#221e18', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }}>
                      {postedTasks.length}/{clientTasks.length}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.01em' }}>
                      {clientTasks.length} video{clientTasks.length !== 1 ? 's' : ''} this month
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                  {[
                    { label: 'Awaiting you', value: reviewTasks.length, accent: '#f8e9c8', accentText: '#a86a00' },
                    { label: 'Published',    value: postedTasks.length, accent: 'transparent', accentText: 'rgba(255,255,255,.7)' },
                    { label: 'In production', value: inProgress.length, accent: 'transparent', accentText: 'rgba(255,255,255,.7)' },
                  ].map(({ label, value, accent, accentText }) => (
                    <div key={label} style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, color: accentText === 'rgba(255,255,255,.7)' ? '#fff' : '#a86a00', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const, background: accent, borderRadius: 8, padding: accent !== 'transparent' ? '2px 10px' : '0' }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', fontWeight: 600, marginTop: 4 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review cards grid */}
              {reviewTasks.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: '#221e18', margin: 0 }}>Needs your review</h2>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#a86a00', background: '#f8e9c8', padding: '2px 10px', borderRadius: 100, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }}>{reviewTasks.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                    {reviewTasks.map(t => (
                      <DesktopReviewCard key={t.clickupTaskId} task={t} thumbnail={thumbnails[t.clickupTaskId] ?? null} />
                    ))}
                  </div>
                </div>
              )}

              {/* Recently reviewed */}
              {postedTasks.length > 0 && (
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', color: '#221e18', margin: '0 0 12px' }}>Recently reviewed</h2>
                  <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 16, overflow: 'hidden' }}>
                    {postedTasks.slice(0, 10).map((t, i) => {
                      const badge = reviewedBadge(t);
                      return (
                        <div key={t.clickupTaskId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px', borderBottom: i < Math.min(postedTasks.length, 10) - 1 ? '1px solid #f0e8df' : 'none' }}>
                          <div style={{ width: 44, height: 44, borderRadius: 10, background: 'linear-gradient(135deg, #2c3540, #4a5562)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'rgba(255,255,255,.5)' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{width:16,height:16}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 14, fontWeight: 600, color: '#221e18', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                          </div>
                          <div style={{ fontSize: 12, color: '#9d9488', fontWeight: 500, flexShrink: 0, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' as const }}>{fmtDate(t.dateUpdated)}</div>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 6, color: badge.color, background: badge.bg, flexShrink: 0, whiteSpace: 'nowrap' as const }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: badge.color }} />
                            {badge.text}
                          </span>
                          <Link href={`/client/videos/${t.clickupTaskId}`} style={{ fontSize: 13, fontWeight: 600, color: '#FF6000', textDecoration: 'none', flexShrink: 0, whiteSpace: 'nowrap' as const }}>View ›</Link>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {clientTasks.length === 0 && !fetchError && (
                <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9d9488' }}>
                  <p style={{ fontSize: 15, margin: 0, fontWeight: 500 }}>No videos found for your account yet.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

// ── Desktop review card (3-column grid) ──────────────────────────

function DesktopReviewCard({ task, thumbnail }: { task: MappedTask; thumbnail: string | null }) {
  const waiting = Math.floor((Date.now() - (() => { const ts = Number(task.dateUpdated); return isNaN(ts) ? new Date(task.dateUpdated) : new Date(ts); })().getTime()) / 86_400_000);
  return (
    <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 22, overflow: 'hidden' }}>
      {/* Thumbnail */}
      <div style={{
        position: 'relative', aspectRatio: '16/10' as const,
        background: thumbnail ? `url(${JSON.stringify(thumbnail)}) center/cover no-repeat` : 'linear-gradient(135deg, #2c3540, #4a5562)',
      }}>
        {task.frameLink && (
          <span style={{ position: 'absolute', top: 10, right: 10, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
            Frame.io
          </span>
        )}
      </div>
      {/* Body */}
      <div style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, color: '#221e18' }}>
          {task.title}
        </div>
        <div style={{ fontSize: 12, color: '#9d9488', fontWeight: 500 }}>
          Submitted {waiting === 0 ? 'today' : waiting === 1 ? 'yesterday' : `${waiting}d ago`}
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 8, color: '#a86a00', background: '#f8e9c8', alignSelf: 'flex-start' as const }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a86a00' }} />
          Awaiting your review
        </span>
        <Link href={`/client/videos/${task.clickupTaskId}`} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '13px', borderRadius: 13, background: '#FF6000', color: '#fff',
          fontWeight: 700, fontSize: 14, textDecoration: 'none',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Watch &amp; review
        </Link>
      </div>
    </div>
  );
}

// ── Mobile-only components (unchanged) ───────────────────────────

function VideoReviewCard({ task, thumbnail }: { task: MappedTask; thumbnail: string | null }) {
  const ts = Number(task.dateUpdated);
  const updatedDate = isNaN(ts) ? new Date(task.dateUpdated) : new Date(ts);
  const waiting = Math.floor((Date.now() - updatedDate.getTime()) / 86_400_000);
  return (
    <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 22, overflow: 'hidden' }}>
      <div style={{
        position: 'relative', aspectRatio: '16/10' as const,
        background: thumbnail ? `url(${JSON.stringify(thumbnail)}) center/cover no-repeat` : 'linear-gradient(135deg, #2c3540, #4a5562)',
      }} />
      <div style={{ padding: '13px 15px 15px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
          {task.title}
        </div>
        <div style={{ fontSize: 12, color: '#9d9488', fontWeight: 500 }}>
          {waiting === 0 ? 'Today' : waiting === 1 ? 'Yesterday' : `${waiting}d ago`}
          {task.dueDate && ` · Due ${fmtDate(task.dueDate)}`}
        </div>
        <div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 9, color: '#a86a00', background: '#f8e9c8' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a86a00' }} />
            Awaiting your review
          </span>
        </div>
        <Link href={`/client/videos/${task.clickupTaskId}`} style={{
          width: '100%', padding: '15px', borderRadius: 13, border: 'none',
          background: '#FF6000', color: '#fff', fontWeight: 700, fontSize: 15,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'inherit', textDecoration: 'none',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Watch &amp; review
        </Link>
        <ApprovalButtons taskId={task.clickupTaskId} currentApproval={task.clientApproval} />
      </div>
    </div>
  );
}

function TabItems({ items }: { items: { label: string; badge: number; active: boolean; icon: React.ReactNode }[] }) {
  return (
    <>
      {items.map(({ label, badge, active, icon }) => (
        <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: active ? '#FF6000' : '#9d9488', position: 'relative', padding: '2px 14px' }}>
          {icon}
          {badge > 0 && (
            <span style={{ position: 'absolute', top: -2, right: 6, minWidth: 16, height: 16, background: '#cf3f36', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 100, display: 'grid', placeItems: 'center', padding: '0 4px', border: '1.5px solid #fff' }}>{badge}</span>
          )}
          {label}
        </div>
      ))}
    </>
  );
}

function VideoRow({ task, color, colorBg, label, date }: { task: MappedTask; color: string; colorBg: string; label?: string; date?: string | null }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#fff', border: '1px solid #ece4d8',
      borderRadius: 16, padding: '10px 12px',
    }}>
      <div style={{ width: 50, height: 50, borderRadius: 11, flexShrink: 0, background: 'linear-gradient(135deg, #3a4a3f, #5e6f56)', display: 'grid', placeItems: 'center', color: '#fff' }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:17,height:17,opacity:.9}}>
          <path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.title}</div>
        <div style={{ fontSize: 11.5, color: '#9d9488', fontWeight: 500, marginTop: 3 }}>
          {task.status}{date ? ` · ${date}` : ''}
        </div>
      </div>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 9, color, background: colorBg, whiteSpace: 'nowrap' as const, flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        {label ?? task.status}
      </span>
    </div>
  );
}
