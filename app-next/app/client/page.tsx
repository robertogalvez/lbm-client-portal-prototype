import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import type { MappedTask } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';
import { NotificationBell } from '@/components/client/NotificationBell';
import { LogoutButton } from '@/components/client/LogoutButton';
import { CalendarView } from '@/components/client/CalendarView';
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


export default async function ClientPortalPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = 'reviews' } = await searchParams;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow || userRow.role !== 'client') redirect('/dashboard');

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

  const clientTasks = allTasks.filter(t => t.clientName === clientName);
  const reviewTasks = clientTasks.filter(t => norm(t.status) === 'for client review');
  const postedTasks = clientTasks.filter(t => norm(t.status) === 'posted in socials');
  const inProgress  = clientTasks.filter(t =>
    !['for client review', 'posted in socials'].includes(norm(t.status))
  );
  const monthStart  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const postedThisMonth = postedTasks.filter(t => new Date(t.dateUpdated).getTime() >= monthStart).length;
  const displayName = (name ?? clientName).split(' ')[0];
  const pct = clientTasks.length > 0 ? Math.round((postedTasks.length / clientTasks.length) * 100) : 0;

  // Fetch Frame.io thumbnails for review cards in parallel
  const thumbnails: Record<string, string | null> = {};
  await Promise.all(reviewTasks.map(async t => {
    if (t.frameLink) thumbnails[t.clickupTaskId] = await getFrameioThumbnail(t.frameLink);
  }));

  const tabItems = [
    { label: 'Reviews', href: '/client?tab=reviews', badge: reviewTasks.length, active: tab === 'reviews', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg> },
    { label: 'Calendar', href: '/client?tab=calendar', badge: 0, active: tab === 'calendar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> },
    { label: 'Account', href: '/client?tab=account', badge: 0, active: tab === 'account', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg> },
  ];

  const DesktopVideoCard = ({ t }: { t: (typeof clientTasks)[0] }) => {
    const thumb = thumbnails[t.clickupTaskId];
    return (
      <div style={{background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 2px 8px #0001'}}>
        {/* 16:9 thumbnail */}
        <div style={{position:'relative', paddingTop:'56.25%', background:'#1a1714'}}>
          {thumb ? (
            <img src={thumb} alt={t.title} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} />
          ) : (
            <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',fontSize:36}}>🎬</div>
          )}
          {t.frameLink && (
            <span style={{position:'absolute',top:8,right:8,background:'#0f6fec',color:'#fff',fontSize:11,padding:'3px 8px',borderRadius:6,fontWeight:600}}>Frame.io</span>
          )}
        </div>
        <div style={{padding:16}}>
          <div style={{fontWeight:700, fontSize:15, marginBottom:10, lineHeight:1.3}}>{t.title}</div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:12}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:'#f97316',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#fff'}}>{initials(t.assignedAmName||'AM')}</div>
            <span style={{fontSize:12, color:'#6b6455'}}>{t.assignedAmName}</span>
          </div>
          <div style={{background:'#fef3c7', color:'#92400e', textAlign:'center', padding:'6px', borderRadius:8, fontSize:12, fontWeight:600, marginBottom:12}}>⏳ Awaiting your review</div>
          <a href={`/client/videos/${t.clickupTaskId}`} style={{display:'block', textAlign:'center', padding:'10px', background:'#f97316', color:'#fff', borderRadius:10, fontWeight:600, fontSize:14, textDecoration:'none', marginBottom:10}}>Watch &amp; review</a>
          <ApprovalButtons taskId={t.clickupTaskId} currentApproval={t.clientApproval} />
        </div>
      </div>
    );
  };

  return (
    <>
    <main className="cp-shell client-mobile">
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
          <NotificationBell tasks={reviewTasks.map(t => ({ clickupTaskId: t.clickupTaskId, title: t.title, dateUpdated: t.dateUpdated }))} />
        </div>

        {/* Scrollable body */}
        <div className="cp-body">
          {/* Pipeline banner — always shown */}
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
                <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>{reviewTasks.length}</div>
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

          {/* ── Reviews tab ── */}
          {tab === 'reviews' && <>
            {reviewTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>
                  Needs your review
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#b06f06', background: '#fbeecf', padding: '2px 9px', borderRadius: 100 }}>{reviewTasks.length}</span>
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
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0', marginTop: 4 }}>Recently posted</div>
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
          </>}

          {/* ── Calendar tab ── */}
          {tab === 'calendar' && (
            <CalendarView tasks={clientTasks.map(t => ({
              clickupTaskId: t.clickupTaskId,
              title: t.title,
              status: t.status,
              dueDate: t.dueDate,
              clientApproval: t.clientApproval,
              frameLink: t.frameLink,
            }))} />
          )}

          {/* ── Account tab ── */}
          {tab === 'account' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Avatar + name */}
              <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 18, padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#FF6000', display: 'grid', placeItems: 'center', color: '#fff', fontSize: 18, fontWeight: 800, flexShrink: 0 }}>
                  {(name ?? clientName ?? 'C').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#221e18' }}>{name ?? clientName}</div>
                  <div style={{ fontSize: 13, color: '#9d9488', marginTop: 2 }}>{clientName}</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total videos', value: clientTasks.length },
                  { label: 'To review', value: reviewTasks.length },
                  { label: 'Posted', value: postedTasks.length },
                ].map(s => (
                  <div key={s.label} style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 14, padding: '14px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#221e18' }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: '#9d9488', fontWeight: 600, marginTop: 3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <LogoutButton />
            </div>
          )}
        </div>

        {/* Tab bar — mobile fixed, desktop inline at bottom of frame */}
        <nav className="cp-tab-bar">
          <TabItems items={tabItems} />
        </nav>
        <nav className="cp-tab-bar-desktop">
          <TabItems items={tabItems} />
        </nav>
      </div>
    </main>

    {/* ─── Desktop layout (≥900px) ─── */}
    <div className="client-desktop">
      {/* Nav */}
      <nav className="cd-nav">
        <div className="cd-nav-inner">
          <span className="cd-logo"><em>LEGACY MEDIA</em></span>
          <div className="cd-tabs">
            <a href="/client?tab=reviews" className={`cd-tab${tab === 'reviews' ? ' cd-active' : ''}`}>
              Reviews {reviewTasks.length > 0 && <span className="cd-tab-badge">{reviewTasks.length}</span>}
            </a>
            <a href="/client?tab=calendar" className={`cd-tab${tab === 'calendar' ? ' cd-active' : ''}`}>Calendar</a>
            <a href="/client?tab=account" className={`cd-tab${tab === 'account' ? ' cd-active' : ''}`}>Account</a>
          </div>
          <div className="cd-nav-right">
            <NotificationBell tasks={reviewTasks.map(t => ({ clickupTaskId: t.clickupTaskId, title: t.title, dateUpdated: t.dateUpdated }))} />
            <span className="cd-client-name">{clientName} / Client workspace</span>
            <div className="cd-avatar">{initials(name ?? clientName ?? 'C')}</div>
          </div>
        </div>
      </nav>

      <div style={{padding: '32px 40px', maxWidth: 1280, margin: '0 auto'}}>
        {/* Welcome */}
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:28}}>
          <div>
            <h1 style={{fontSize:28, fontWeight:700, margin:0}}>Welcome back, {(name ?? clientName ?? 'Client').split(' ')[0]}</h1>
            <p style={{margin:'6px 0 0', color:'#6b6455', fontSize:15}}>Here&apos;s your content overview</p>
          </div>
          <span style={{background:'#d4edda', color:'#1a6b35', padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:600}}>🔒 Secure client access</span>
        </div>

        {/* Pipeline stats banner */}
        <div style={{background:'#1a1714', borderRadius:16, padding:'24px 32px', marginBottom:28, display:'flex', alignItems:'center', gap:32, color:'#fff'}}>
          {/* Conic progress ring */}
          <div style={{position:'relative', width:72, height:72, flexShrink:0}}>
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="30" fill="none" stroke="#333" strokeWidth="8"/>
              <circle cx="36" cy="36" r="30" fill="none" stroke="#f97316" strokeWidth="8"
                strokeDasharray={`${pct * 1.885} 188.5`} strokeLinecap="round"
                transform="rotate(-90 36 36)"/>
            </svg>
            <span style={{position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700}}>{postedTasks.length}/{clientTasks.length}</span>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:11, letterSpacing:2, color:'#888', fontWeight:600, marginBottom:4}}>
              {new Date().toLocaleString('default',{month:'long'}).toUpperCase()} CONTENT PACKAGE
            </div>
            <div style={{fontSize:20, fontWeight:700}}>{clientTasks.length} videos this month</div>
          </div>
          {/* Stat columns */}
          {[
            {label:'Awaiting you', val: reviewTasks.length, color:'#f59e0b'},
            {label:'Published', val: postedTasks.length, color:'#22c55e'},
            {label:'In production', val: inProgress.length, color:'#60a5fa'},
          ].map(s => (
            <div key={s.label} style={{textAlign:'center', minWidth:80}}>
              <div style={{fontSize:32, fontWeight:800, color: s.color}}>{s.val}</div>
              <div style={{fontSize:12, color:'#aaa', marginTop:2}}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'reviews' && (
          <div>
            {/* Needs your review */}
            {reviewTasks.length > 0 && (
              <section style={{marginBottom:36}}>
                <h2 style={{fontSize:18, fontWeight:700, marginBottom:16}}>Needs your review</h2>
                <div className="cd-review-grid">
                  {reviewTasks.map(t => <DesktopVideoCard key={t.clickupTaskId} t={t} />)}
                </div>
              </section>
            )}

            {/* In production */}
            {inProgress.length > 0 && (
              <section style={{marginBottom:36}}>
                <h2 style={{fontSize:18, fontWeight:700, marginBottom:12}}>In production</h2>
                {inProgress.map(t => (
                  <div key={t.clickupTaskId} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #e8e0d0'}}>
                    <div style={{width:40,height:40,borderRadius:8,background:'#2a2520',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎬</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600, fontSize:14}}>{t.title}</div>
                      <div style={{fontSize:12, color:'#6b6455'}}>{t.assignee}</div>
                    </div>
                    <span style={{background:'#ede9e0', color:'#6b6455', fontSize:12, padding:'3px 10px', borderRadius:12}}>{norm(t.status)}</span>
                  </div>
                ))}
              </section>
            )}

            {/* Recently reviewed */}
            {(() => {
              const reviewed = clientTasks
                .filter(t => t.clientApproval === 'approved' || t.clientApproval === 'changes_requested')
                .sort((a,b) => (Number(b.dateUpdated)||0) - (Number(a.dateUpdated)||0))
                .slice(0, 6);
              return reviewed.length > 0 ? (
                <section>
                  <h2 style={{fontSize:18, fontWeight:700, marginBottom:12}}>Recently reviewed</h2>
                  {reviewed.map(t => (
                    <div key={t.clickupTaskId} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #e8e0d0'}}>
                      <div style={{width:40,height:40,borderRadius:8,background:'#2a2520',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎬</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600, fontSize:14}}>{t.title}</div>
                        <div style={{fontSize:12, color:'#6b6455'}}>{t.assignee}</div>
                      </div>
                      <span style={{fontSize:12, color:'#888'}}>{t.dateUpdated ? fmtDate(t.dateUpdated) : ''}</span>
                      <span style={{
                        background: t.clientApproval === 'approved' ? '#d4edda' : '#fde8d0',
                        color: t.clientApproval === 'approved' ? '#1a6b35' : '#c2410c',
                        fontSize:12, padding:'3px 10px', borderRadius:12, fontWeight:600
                      }}>{t.clientApproval === 'approved' ? 'Approved' : 'Changes requested'}</span>
                      <a href={`/client/videos/${t.clickupTaskId}`} style={{fontSize:13, color:'#f97316', fontWeight:600}}>View →</a>
                    </div>
                  ))}
                </section>
              ) : null;
            })()}
          </div>
        )}

        {tab === 'calendar' && <CalendarView tasks={clientTasks.map(t => ({
          clickupTaskId: t.clickupTaskId,
          title: t.title,
          status: t.status,
          dueDate: t.dueDate,
          clientApproval: t.clientApproval,
          frameLink: t.frameLink,
        }))} />}

        {tab === 'account' && (
          <div style={{maxWidth:480}}>
            <h2 style={{fontSize:22, fontWeight:700, marginBottom:20}}>Account</h2>
            <div style={{background:'#fff', borderRadius:16, padding:24, boxShadow:'0 1px 4px #0001'}}>
              <div style={{display:'flex', alignItems:'center', gap:16, marginBottom:20}}>
                <div className="cd-avatar" style={{width:56,height:56,fontSize:22}}>{initials(name ?? clientName ?? 'C')}</div>
                <div>
                  <div style={{fontWeight:700, fontSize:18}}>{name ?? clientName}</div>
                  <div style={{color:'#6b6455', fontSize:14}}>{clientName}</div>
                </div>
              </div>
              <a href="/api/auth/signout" style={{display:'block', textAlign:'center', padding:'12px', background:'#1a1714', color:'#fff', borderRadius:10, fontWeight:600, textDecoration:'none'}}>Sign out</a>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

function VideoReviewCard({ task, thumbnail }: { task: MappedTask; thumbnail: string | null }) {
  const ts = Number(task.dateUpdated);
  const updatedDate = isNaN(ts) ? new Date(task.dateUpdated) : new Date(ts);
  const waiting = Math.floor((Date.now() - updatedDate.getTime()) / 86_400_000);
  return (
    <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 22, overflow: 'hidden' }}>
      {/* Thumbnail */}
      <div style={{
        position: 'relative', aspectRatio: '16/10' as const,
        background: thumbnail
          ? `url(${JSON.stringify(thumbnail)}) center/cover no-repeat`
          : 'linear-gradient(135deg, #2c3540, #4a5562)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
      </div>

      {/* Body */}
      <div style={{ padding: '13px 15px 15px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
          {task.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, fontSize: 12, color: '#9d9488', fontWeight: 500 }}>
          {task.assignedAmName && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: '#5e6b7a',
                color: '#fff', display: 'grid', placeItems: 'center',
                fontSize: 9.5, fontWeight: 700, flexShrink: 0,
              }}>{initials(task.assignedAmName)}</span>
              <span>Account Manager · {task.assignedAmName}</span>
            </span>
          )}
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} />
          <span>{waiting === 0 ? 'Today' : waiting === 1 ? 'Yesterday' : `${waiting}d ago`}</span>
          {task.dueDate && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} />
              <span>Due {fmtDate(task.dueDate)}</span>
            </>
          )}
        </div>

        <div>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 9,
            color: '#b06f06', background: '#fbeecf',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#b06f06' }} />
            Awaiting your review
          </span>
        </div>

        {/* Primary CTA */}
        <Link href={`/client/videos/${task.clickupTaskId}`} style={{
          width: '100%', padding: '15px', borderRadius: 15, border: 'none',
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

function TabItems({ items }: { items: { label: string; href: string; badge: number; active: boolean; icon: React.ReactNode }[] }) {
  return (
    <>
      {items.map(({ label, href, badge, active, icon }) => (
        <a key={label} href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: active ? '#B23E00' : '#9d9488', position: 'relative', padding: '2px 14px', textDecoration: 'none' }}>
          {icon}
          {badge > 0 && (
            <span style={{ position: 'absolute', top: -2, right: 6, minWidth: 16, height: 16, background: '#cf3f36', color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 100, display: 'grid', placeItems: 'center', padding: '0 4px', border: '1.5px solid #fff' }}>{badge}</span>
          )}
          {label}
        </a>
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
      <div style={{
        width: 50, height: 50, borderRadius: 11, flexShrink: 0,
        background: 'linear-gradient(135deg, #3a4a3f, #5e6f56)',
        display: 'grid', placeItems: 'center', color: '#fff',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:17,height:17,opacity:.9}}>
          <path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>
        </svg>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {task.title}
        </div>
        <div style={{ fontSize: 11.5, color: '#9d9488', fontWeight: 500, marginTop: 3 }}>
          {task.status}{date ? ` · ${date}` : ''}
        </div>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 9,
        color, background: colorBg, whiteSpace: 'nowrap' as const, flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
        {label ?? task.status}
      </span>
    </div>
  );
}
