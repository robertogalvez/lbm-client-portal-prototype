import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList, getClientQuotas } from '@/lib/clickup';
import { getThumbnailUrl } from '@/lib/frameio';
import { statusColors } from '@/components/ui/StatusBadge';
import type { MappedTask, ClientQuota } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';
import { NotificationBell } from '@/components/client/NotificationBell';
import { LogoutButton } from '@/components/client/LogoutButton';
import { CalendarView } from '@/components/client/CalendarView';
import { InvoicesView } from '@/components/client/InvoicesView';
import { MonthlyReport } from '@/components/client/MonthlyReport';
import { ViewAsBanner } from '@/components/admin/ViewAsBanner';
import { BannerStats } from '@/components/client/BannerStats';
import { getViewAsClient } from '@/lib/view-as';
import { getInvoicesForClient, isQuickBooksConfigured } from '@/lib/quickbooks';
import { InstagramLink } from '@/components/InstagramLink';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function displayTitle(clientFacingTitle: string | null, title: string, maxLength = 40): string {
  const display = clientFacingTitle || title;
  return display.length > maxLength ? display.slice(0, maxLength) + '…' : display;
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
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name, isAlsoClient: authUsers.isAlsoClient })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  const isStaff = userRow?.role === 'admin' || userRow?.role === 'account_manager';
  const viewAsClient = isStaff ? await getViewAsClient() : null;
  if (!userRow || (userRow.role !== 'client' && !userRow.isAlsoClient && !viewAsClient)) redirect('/dashboard');

  const clientName = viewAsClient ? viewAsClient.name : userRow.clientName;
  const name = viewAsClient ? null : userRow.name;
  const isAdminClient = !viewAsClient && userRow.isAlsoClient && userRow.role !== 'client';
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

  const [tasksResult, quotasResult, [clientRecord]] = await Promise.all([
    getTasksFromList(process.env.CLICKUP_LIST_ID!, false).then(
      value => ({ value, error: null as string | null }),
      (e: unknown) => ({ value: [] as MappedTask[], error: e instanceof Error ? e.message : 'Unknown error' }),
    ),
    getClientQuotas().then(
      value => ({ value, error: null as string | null }),
      (e: unknown) => ({ value: [] as ClientQuota[], error: e instanceof Error ? e.message : 'Unknown error' }),
    ),
    db.select({ showCalendar: clients.showCalendar, showInvoices: clients.showInvoices, showReport: clients.showReport }).from(clients).where(eq(clients.name, clientName)).limit(1),
  ]);
  const allTasks = tasksResult.value;
  const clientQuotas = quotasResult.value;
  const fetchError = tasksResult.error ?? quotasResult.error;
  const showCalendar = clientRecord?.showCalendar ?? false;
  const quickbooksConnected = isQuickBooksConfigured();
  // Only surface the Invoices tab once QuickBooks is actually wired up — otherwise
  // clients would see a tab full of labeled "sample data" as if it were real.
  const showInvoices = (clientRecord?.showInvoices ?? false) && quickbooksConnected;
  const showReport = clientRecord?.showReport ?? false;

  const clientQuota = clientQuotas.find(q => q.name === clientName);
  const agreedReels = clientQuota?.reelsPerMonth ?? 0;
  const agreedYoutube = clientQuota?.ytPerMonth ?? 0;
  const clientInvoices = showInvoices ? await getInvoicesForClient(clientName) : [];
  const effectiveTab =
    (tab === 'invoices' && !showInvoices) || (tab === 'calendar' && !showCalendar) || (tab === 'report' && !showReport)
      ? 'reviews'
      : tab;

  const clientTasks = allTasks.filter(t => t.clientName === clientName);
  const reviewTasks = clientTasks.filter(t => norm(t.status) === 'for client review');
  const correctionsTasks = clientTasks.filter(t => norm(t.status) === 'in progress (corrections)');
  // "On its way" combines ready-to-post and already-posted into one section —
  // each row's own status badge (via statusColors) distinguishes which.
  const onItsWayTasks = clientTasks.filter(t => ['ready to be posted', 'posted in socials'].includes(norm(t.status)));
  const postedTasks = clientTasks.filter(t => norm(t.status) === 'posted in socials');
  const inProgress  = clientTasks.filter(t =>
    !['for client review', 'in progress (corrections)', 'ready to be posted', 'posted in socials'].includes(norm(t.status))
  );
  const monthStart  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const deliveredReels = postedTasks.filter(t => {
    const ts = Number(t.dateUpdated);
    const date = isNaN(ts) ? new Date(t.dateUpdated) : new Date(ts);
    return date.getTime() >= monthStart && !t.isYoutube;
  }).length;
  const deliveredYoutube = postedTasks.filter(t => {
    const ts = Number(t.dateUpdated);
    const date = isNaN(ts) ? new Date(t.dateUpdated) : new Date(ts);
    return date.getTime() >= monthStart && t.isYoutube;
  }).length;
  const displayName = (name ?? clientName).split(' ')[0];
  const pct = clientTasks.length > 0 ? Math.round((postedTasks.length / clientTasks.length) * 100) : 0;

  // Fetch Frame.io thumbnails for review cards in parallel — authenticated
  // via the v4 API (media_links.thumbnail), not scraped from the share page.
  const thumbnails: Record<string, string | null> = {};
  await Promise.all(reviewTasks.map(async t => {
    if (t.frameLink) thumbnails[t.clickupTaskId] = await getThumbnailUrl(t.frameLink);
  }));

  const tabItems = [
    { label: 'Reviews', href: '/client?tab=reviews', badge: reviewTasks.length, active: effectiveTab === 'reviews', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg> },
    ...(showCalendar ? [{ label: 'Calendar', href: '/client?tab=calendar', badge: 0, active: effectiveTab === 'calendar', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> }] : []),
    ...(showInvoices ? [{ label: 'Invoices', href: '/client?tab=invoices', badge: 0, active: effectiveTab === 'invoices', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6M9 9h1"/></svg> }] : []),
    ...(showReport ? [{ label: 'Report', href: '/client?tab=report', badge: 0, active: effectiveTab === 'report', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/></svg> }] : []),
    { label: 'Account', href: '/client?tab=account', badge: 0, active: effectiveTab === 'account', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg> },
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
          <div style={{fontWeight:700, fontSize:15, marginBottom:12, lineHeight:1.3}}>{t.clientFacingTitle || t.title}</div>
          <div style={{background:'#fef3c7', color:'#92400e', textAlign:'center', padding:'6px', borderRadius:8, fontSize:12, fontWeight:600, marginBottom:12}}>⏳ Awaiting your review</div>
          <a href={`/client/videos/${t.clickupTaskId}`} style={{display:'block', textAlign:'center', padding:'10px', background:'#f97316', color:'#fff', borderRadius:10, fontWeight:600, fontSize:14, textDecoration:'none', marginBottom:10}}>Watch &amp; review</a>
          <ApprovalButtons taskId={t.clickupTaskId} currentApproval={t.clientApproval} />
        </div>
      </div>
    );
  };

  return (
    <>
    {viewAsClient && <ViewAsBanner clientName={viewAsClient.name} />}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isAdminClient && (
              <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: '#54616f', background: '#f5f7f9', border: '1px solid #e7ebef', borderRadius: 8, padding: '6px 10px', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M15 18l-6-6 6-6"/></svg>
                Dashboard
              </Link>
            )}
            <NotificationBell tasks={reviewTasks.map(t => ({ clickupTaskId: t.clickupTaskId, title: t.title, dateUpdated: t.dateUpdated }))} />
          </div>
        </div>

        {/* Scrollable body */}
        <div className="cp-body">
          {/* Pipeline banner — always shown */}
          <div style={{ background: '#221e18', color: '#fff', borderRadius: 20, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                  CONTENT PIPELINE
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
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#221e18', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, color: '#fff' }}>{postedTasks.length}/{clientTasks.length}</div>
                </div>
              </div>
            </div>
            {/* Agreed vs Delivered (this month) */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'rgba(255,255,255,.8)', flexWrap: 'wrap' }}>
              <div>Reels - Agreed: <span style={{ fontWeight: 700 }}>{agreedReels}</span> | Delivered: <span style={{ fontWeight: 700 }}>{deliveredReels}</span></div>
              <div>YT - Agreed: <span style={{ fontWeight: 700 }}>{agreedYoutube}</span> | Delivered: <span style={{ fontWeight: 700 }}>{deliveredYoutube}</span></div>
            </div>
          </div>

          {fetchError && (
            <div style={{ background: '#fbe7e2', border: '1px solid #f8d0cc', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
              Error loading content: {fetchError}
            </div>
          )}

          {/* ── Reviews tab ── */}
          {effectiveTab === 'reviews' && <>
            {reviewTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>
                  🔴 Needs your review
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '2px 9px', borderRadius: 100 }}>{reviewTasks.length}</span>
                </div>
                <p style={{ fontSize: 12, color: '#6b6455', margin: '0 0 4px', fontStyle: 'italic' }}>Please review these videos and approve or request changes</p>
                {reviewTasks.map(t => (
                  <VideoReviewCard key={t.clickupTaskId} task={t} thumbnail={thumbnails[t.clickupTaskId] ?? null} />
                ))}
              </div>
            )}
            {correctionsTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>🛠️ In corrections</div>
                <p style={{ fontSize: 12, color: '#6b6455', margin: '0 0 4px', fontStyle: 'italic' }}>Back with the editor for the changes you requested</p>
                {correctionsTasks.map(t => (
                  <VideoRow key={t.clickupTaskId} task={t} />
                ))}
              </div>
            )}
            {inProgress.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>📹 In production</div>
                <p style={{ fontSize: 12, color: '#6b6455', margin: '0 0 4px', fontStyle: 'italic' }}>Videos currently being edited and prepared for your review</p>
                {inProgress.map(t => (
                  <VideoRow key={t.clickupTaskId} task={t} />
                ))}
              </div>
            )}
            {onItsWayTasks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>🚀 On its way</div>
                <p style={{ fontSize: 12, color: '#6b6455', margin: '0 0 4px', fontStyle: 'italic' }}>Approved videos queued to post or already live</p>
                {onItsWayTasks.map(t => (
                  <VideoRow key={t.clickupTaskId} task={t} showViewLink />
                ))}
              </div>
            )}
            {(() => {
              const reviewed = clientTasks
                .filter(t => t.clientApproval === 'approved' || t.clientApproval === 'changes_requested')
                .sort((a, b) => (Number(b.dateUpdated) || 0) - (Number(a.dateUpdated) || 0))
                .slice(0, 8);
              return reviewed.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0', marginTop: 4 }}>✅ Recently reviewed</div>
                  <p style={{ fontSize: 12, color: '#6b6455', margin: '0 0 4px', fontStyle: 'italic' }}>Your recent approve / request-changes decisions</p>
                  {reviewed.map(t => (
                    <VideoRow
                      key={t.clickupTaskId}
                      task={t}
                      color={t.clientApproval === 'approved' ? '#14805f' : '#cf3f36'}
                      colorBg={t.clientApproval === 'approved' ? '#e4f3ec' : '#fbe4e2'}
                      label={t.clientApproval === 'approved' ? 'Approved' : 'Changes requested'}
                      showViewLink
                    />
                  ))}
                </div>
              ) : null;
            })()}
            {clientTasks.length === 0 && !fetchError && (
              <div style={{ textAlign: 'center', padding: '64px 24px', color: '#9d9488' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>🎬</div>
                <p style={{ fontSize: 14, margin: 0, fontWeight: 500 }}>No videos found for your account yet.</p>
              </div>
            )}
          </>}

          {/* ── Calendar tab ── */}
          {showCalendar && effectiveTab === 'calendar' && (
            <CalendarView tasks={clientTasks.map(t => ({
              clickupTaskId: t.clickupTaskId,
              title: t.title,
              clientFacingTitle: t.clientFacingTitle,
              status: t.status,
              dueDate: t.dueDate,
              dateUpdated: t.dateUpdated,
              clientApproval: t.clientApproval,
              frameLink: t.frameLink,
              rawDriveLink: t.rawDriveLink,
              publishDate: t.publishDate,
            }))} />
          )}

          {/* ── Invoices tab ── */}
          {showInvoices && effectiveTab === 'invoices' && (
            <InvoicesView invoices={clientInvoices} connected={quickbooksConnected} />
          )}

          {/* ── Report tab ── */}
          {showReport && effectiveTab === 'report' && (
            <MonthlyReport clientName={clientName} videos={postedTasks.map(t => ({
              clickupTaskId: t.clickupTaskId,
              title: t.title,
              datePosted: t.publishDate ?? t.dateUpdated,
              frameLink: t.frameLink,
              instagramUrl: t.instagramUrl,
            }))} />
          )}

          {/* ── Account tab ── */}
          {effectiveTab === 'account' && (
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

              <LogoutButton label="Close session" />
            </div>
          )}
        </div>

        {/* Tab bar — mobile fixed, desktop inline at bottom of frame */}
        {/* Breakpoint variants of the same nav. Only one is ever displayed and
            display:none keeps the other out of the accessibility tree, but the
            labels are still distinct so the two landmarks never collide. */}
        <nav aria-label="Sections" className="cp-tab-bar">
          <TabItems items={tabItems} />
        </nav>
        <nav aria-label="Sections, desktop" className="cp-tab-bar-desktop">
          <TabItems items={tabItems} />
        </nav>
      </div>
    </main>

    {/* ─── Desktop layout (≥900px) ─── */}
    <div className="client-desktop">
      {/* Nav */}
      <nav aria-label="Main" className="cd-nav">
        <div className="cd-nav-inner">
          <span className="cd-logo"><em>LEGACY MEDIA</em></span>
          <div className="cd-tabs">
            <Link href="/client?tab=reviews" className={`cd-tab${effectiveTab === 'reviews' ? ' cd-active' : ''}`}>
              Reviews {reviewTasks.length > 0 && <span className="cd-tab-badge">{reviewTasks.length}</span>}
            </Link>
            {showCalendar && (
              <Link href="/client?tab=calendar" className={`cd-tab${effectiveTab === 'calendar' ? ' cd-active' : ''}`}>Calendar</Link>
            )}
            {showInvoices && (
              <Link href="/client?tab=invoices" className={`cd-tab${effectiveTab === 'invoices' ? ' cd-active' : ''}`}>Invoices</Link>
            )}
            {showReport && (
              <Link href="/client?tab=report" className={`cd-tab${effectiveTab === 'report' ? ' cd-active' : ''}`}>Report</Link>
            )}
            <Link href="/client?tab=account" className={`cd-tab${effectiveTab === 'account' ? ' cd-active' : ''}`}>Account</Link>
          </div>
          <div className="cd-nav-right">
            {isAdminClient && (
              <Link href="/dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 700, color: '#54616f', background: '#f5f7f9', border: '1px solid #e7ebef', borderRadius: 8, padding: '6px 12px', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M15 18l-6-6 6-6"/></svg>
                Dashboard
              </Link>
            )}
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
        <div style={{background:'#1a1714', borderRadius:16, padding:'24px 32px', marginBottom:28, display:'flex', flexDirection:'column', gap:16, color:'#fff'}}>
          <div style={{display:'flex', alignItems:'center', gap:32}}>
            {/* Conic progress ring — arc and center label are the same fraction
                (all-time posted / total pipeline), so the ring actually
                illustrates the number next to it instead of a different one. */}
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
                CONTENT PIPELINE
              </div>
              <div style={{fontSize:20, fontWeight:700}}>{clientTasks.length} video{clientTasks.length !== 1 ? 's' : ''} in pipeline</div>
            </div>
            {/* Stat columns - made interactive with Reels/YouTube breakdown */}
            <BannerStats stats={[
              {
                label:'Awaiting you',
                count: reviewTasks.length,
                reelCount: reviewTasks.filter(t => !t.isYoutube).length,
                youtubeCount: reviewTasks.filter(t => t.isYoutube).length,
                color:'#f59e0b',
                tasks: reviewTasks,
              },
              {
                label:'Published',
                count: postedTasks.length,
                reelCount: postedTasks.filter(t => !t.isYoutube).length,
                youtubeCount: postedTasks.filter(t => t.isYoutube).length,
                color:'#22c55e',
                tasks: postedTasks,
              },
              {
                label:'In production',
                count: inProgress.length,
                reelCount: inProgress.filter(t => !t.isYoutube).length,
                youtubeCount: inProgress.filter(t => t.isYoutube).length,
                color:'#60a5fa',
                tasks: inProgress,
              },
            ]} />
          </div>
          {/* Agreed vs Delivered (this month) — same monthly quota pacing shown on mobile */}
          <div style={{display:'flex', gap:24, fontSize:13, color:'rgba(255,255,255,.7)', flexWrap:'wrap', borderTop:'1px solid rgba(255,255,255,.1)', paddingTop:14}}>
            <div>Reels - Agreed: <span style={{fontWeight:700, color:'#fff'}}>{agreedReels}</span> | Delivered: <span style={{fontWeight:700, color:'#fff'}}>{deliveredReels}</span></div>
            <div>YT - Agreed: <span style={{fontWeight:700, color:'#fff'}}>{agreedYoutube}</span> | Delivered: <span style={{fontWeight:700, color:'#fff'}}>{deliveredYoutube}</span></div>
          </div>
        </div>

        {/* Tab content */}
        {effectiveTab === 'reviews' && (
          <div>
            {/* Needs your review */}
            {reviewTasks.length > 0 && (
              <section style={{marginBottom:36}}>
                <div style={{display:'flex', alignItems:'center', gap:12, marginBottom:8}}>
                  <h2 style={{fontSize:18, fontWeight:700, margin:0}}>🔴 Needs your review</h2>
                  <span style={{fontSize:13, fontWeight:700, color:'#dc2626', background:'#fee2e2', padding:'4px 12px', borderRadius:20}}>Action required</span>
                </div>
                <p style={{fontSize:13, color:'#6b6455', margin:'0 0 16px', fontStyle:'italic'}}>Please review these videos and approve or request changes</p>
                <div className="cd-review-grid">
                  {reviewTasks.map(t => <DesktopVideoCard key={t.clickupTaskId} t={t} />)}
                </div>
              </section>
            )}

            {/* In corrections */}
            {correctionsTasks.length > 0 && (
              <section style={{marginBottom:36}}>
                <h2 style={{fontSize:18, fontWeight:700, marginBottom:8}}>🛠️ In corrections</h2>
                <p style={{fontSize:13, color:'#6b6455', margin:'0 0 12px', fontStyle:'italic'}}>Back with the editor for the changes you requested</p>
                {correctionsTasks.map(t => <DesktopStatusRow key={t.clickupTaskId} t={t} />)}
              </section>
            )}

            {/* In production */}
            {inProgress.length > 0 && (
              <section style={{marginBottom:36}}>
                <h2 style={{fontSize:18, fontWeight:700, marginBottom:8}}>📹 In production</h2>
                <p style={{fontSize:13, color:'#6b6455', margin:'0 0 12px', fontStyle:'italic'}}>Videos currently being edited and prepared for your review</p>
                {inProgress.map(t => <DesktopStatusRow key={t.clickupTaskId} t={t} />)}
              </section>
            )}

            {/* On its way */}
            {onItsWayTasks.length > 0 && (
              <section style={{marginBottom:36}}>
                <h2 style={{fontSize:18, fontWeight:700, marginBottom:8}}>🚀 On its way</h2>
                <p style={{fontSize:13, color:'#6b6455', margin:'0 0 12px', fontStyle:'italic'}}>Approved videos queued to post or already live</p>
                {onItsWayTasks.map(t => <DesktopStatusRow key={t.clickupTaskId} t={t} showViewLink />)}
              </section>
            )}

            {/* Recently reviewed */}
            {(() => {
              const reviewed = clientTasks
                .filter(t => t.clientApproval === 'approved' || t.clientApproval === 'changes_requested')
                .sort((a,b) => (Number(b.dateUpdated)||0) - (Number(a.dateUpdated)||0))
                .slice(0, 6);
              const approved = reviewed.filter(t => t.clientApproval === 'approved').length;
              const changesRequested = reviewed.filter(t => t.clientApproval === 'changes_requested').length;
              return reviewed.length > 0 ? (
                <section>
                  <h2 style={{fontSize:18, fontWeight:700, marginBottom:8}}>✅ Recently reviewed</h2>
                  <p style={{fontSize:13, color:'#6b6455', margin:'0 0 12px', fontStyle:'italic'}}>
                    Summary: <strong style={{color:'#1a6b35'}}>{approved} approved</strong> {changesRequested > 0 && <>, <strong style={{color:'#c2410c'}}>{changesRequested} changes requested</strong></>}
                  </p>
                  {reviewed.map(t => (
                    <div key={t.clickupTaskId} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #e8e0d0'}}>
                      <div style={{width:40,height:40,borderRadius:8,background:'#2a2520',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎬</div>
                      <div style={{flex:1}}>
                        <div style={{fontWeight:600, fontSize:14}} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
                      </div>
                      <span style={{
                        background: t.clientApproval === 'approved' ? '#d4edda' : '#fde8d0',
                        color: t.clientApproval === 'approved' ? '#1a6b35' : '#c2410c',
                        fontSize:12, padding:'4px 12px', borderRadius:12, fontWeight:600, display:'inline-flex', alignItems:'center', gap:4
                      }}>{t.clientApproval === 'approved' ? '✅ Approved' : '⚠️ Changes requested'}</span>
                      {t.instagramUrl && <InstagramLink url={t.instagramUrl} label="Instagram" compact />}
                      <a href={`/client/videos/${t.clickupTaskId}`} style={{fontSize:13, color:'#f97316', fontWeight:600}}>View →</a>
                    </div>
                  ))}
                </section>
              ) : null;
            })()}
          </div>
        )}

        {showCalendar && effectiveTab === 'calendar' && <CalendarView tasks={clientTasks.map(t => ({
          clickupTaskId: t.clickupTaskId,
          title: t.title,
          clientFacingTitle: t.clientFacingTitle,
          status: t.status,
          dueDate: t.dueDate,
          dateUpdated: t.dateUpdated,
          clientApproval: t.clientApproval,
          frameLink: t.frameLink,
          rawDriveLink: t.rawDriveLink,
          publishDate: t.publishDate,
        }))} />}

        {showInvoices && effectiveTab === 'invoices' && (
          <div style={{ maxWidth: 480 }}>
            <InvoicesView invoices={clientInvoices} connected={quickbooksConnected} />
          </div>
        )}

        {showReport && effectiveTab === 'report' && (
          <MonthlyReport clientName={clientName} videos={postedTasks.map(t => ({
            clickupTaskId: t.clickupTaskId,
            title: t.title,
            datePosted: t.publishDate ?? t.dateUpdated,
            frameLink: t.frameLink,
            instagramUrl: t.instagramUrl,
          }))} />
        )}

        {effectiveTab === 'account' && (
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
              <LogoutButton style={{ padding: '12px', background: '#1a1714', color: '#fff', border: 'none', borderRadius: 10 }} label="Close session" />
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
          {task.clientFacingTitle || task.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, fontSize: 12, color: '#9d9488', fontWeight: 500 }}>
          <span>{waiting === 0 ? 'Today' : waiting === 1 ? 'Yesterday' : `${waiting}d ago`}</span>
          {task.dueDate && (
            <>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} />
              <span style={{
                color: new Date(task.dueDate).getTime() < Date.now() ? '#dc2626' : '#9d9488',
                fontWeight: new Date(task.dueDate).getTime() < Date.now() ? 600 : 500,
              }}>
                {new Date(task.dueDate).getTime() < Date.now() ? '⚠️ Overdue' : 'Due'} {fmtDate(task.dueDate)}
              </span>
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

// Desktop equivalent of VideoRow — used by the In corrections / In production
// / On its way sections. Colors come from the same shared statusColors()
// mapping as everywhere else, so a given status reads the same everywhere.
function DesktopStatusRow({ t, showViewLink }: { t: MappedTask; showViewLink?: boolean }) {
  const { color, bg } = statusColors(t.status);
  return (
    <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #e8e0d0'}}>
      <div style={{width:40,height:40,borderRadius:8,background:'#2a2520',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎬</div>
      <div style={{flex:1}}>
        <div style={{fontWeight:600, fontSize:14}} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
      </div>
      <span style={{background:bg, color, fontSize:12, padding:'3px 10px', borderRadius:12, fontWeight:700}}>{t.status}</span>
      {t.instagramUrl && <InstagramLink url={t.instagramUrl} label="Instagram" compact />}
      {showViewLink && (
        <Link href={`/client/videos/${t.clickupTaskId}`} style={{fontSize:12, color:'#FF6000', textDecoration:'none', padding:'4px 8px', fontWeight:600}}>
          View →
        </Link>
      )}
      {t.rawDriveLink && (
        <a href={t.rawDriveLink} target="_blank" rel="noopener noreferrer" style={{fontSize:12, color:'#FF6000', textDecoration:'none', padding:'4px 8px', fontWeight:600}}>
          Raw file →
        </a>
      )}
    </div>
  );
}

function TabItems({ items }: { items: { label: string; href: string; badge: number; active: boolean; icon: React.ReactNode }[] }) {
  return (
    <>
      {items.map(({ label, href, badge, active, icon }) => (
        <a key={label} href={href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: active ? '#B23E00' : '#9d9488', position: 'relative', padding: '6px 14px', textDecoration: 'none' }}>
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

function VideoRow({ task, color, colorBg, label, showViewLink }: { task: MappedTask; color?: string; colorBg?: string; label?: string; showViewLink?: boolean }) {
  const derived = statusColors(task.status);
  const fg = color ?? derived.color;
  const bg = colorBg ?? derived.bg;
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
        <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' }} title={task.clientFacingTitle || task.title}>
          {displayTitle(task.clientFacingTitle, task.title)}
        </div>
        <div style={{ fontSize: 11.5, color: '#9d9488', fontWeight: 500, marginTop: 3, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span>{task.status}</span>
          {task.instagramUrl && <InstagramLink url={task.instagramUrl} label="Instagram" compact />}
        </div>
      </div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 9,
        color: fg, background: bg, whiteSpace: 'nowrap' as const, flexShrink: 0,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />
        {label ?? task.status}
      </span>
      {showViewLink && (
        <Link href={`/client/videos/${task.clickupTaskId}`} style={{fontSize:11, color:'#FF6000', textDecoration:'none', padding:'4px 8px', flexShrink:0, fontWeight:600}}>
          View →
        </Link>
      )}
      {task.rawDriveLink && (
        <a href={task.rawDriveLink} target="_blank" rel="noopener noreferrer" style={{fontSize:11, color:'#FF6000', textDecoration:'none', padding:'4px 8px', flexShrink:0, fontWeight:600}}>
          Raw →
        </a>
      )}
    </div>
  );
}
