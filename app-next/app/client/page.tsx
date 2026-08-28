import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractPeriodClients, contractMonths, videoPriorities } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import { getThumbnailUrl } from '@/lib/frameio';
import { statusColors } from '@/components/ui/StatusBadge';
import type { MappedTask } from '@/lib/clickup';
import { NotificationBell } from '@/components/client/NotificationBell';
import { LogoutButton } from '@/components/client/LogoutButton';
import { CalendarView } from '@/components/client/CalendarView';
import { InvoicesView } from '@/components/client/InvoicesView';
import { MonthlyReport } from '@/components/client/MonthlyReport';
import { ViewAsBanner } from '@/components/admin/ViewAsBanner';
import { BannerStats } from '@/components/client/BannerStats';
import { PriorityReorderList } from '@/components/client/PriorityReorderList';
import { getViewAsClient } from '@/lib/view-as';
import { getInvoicesForClient, isQuickBooksConfigured } from '@/lib/quickbooks';
import { InstagramLink } from '@/components/InstagramLink';
import { clientStatusLabel } from '@/lib/client-status';
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

// The client-facing name is what the client actually recognizes; the task
// name is LBM's internal label for the same video. Show both — friendly
// name first, internal name underneath — so the client can match what we
// call it against what they asked for. Falls back to the internal name
// alone when no client-facing name has been set, rather than duplicating it.
function VideoTitle({ clientFacingTitle, title }: { clientFacingTitle: string | null; title: string }) {
  if (!clientFacingTitle) return <>{title}</>;
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span>{clientFacingTitle}</span>
      <span style={{ fontSize: '0.78em', fontWeight: 500, color: '#9d9488' }}>{title}</span>
    </span>
  );
}

function AdBadge({ deliverableType }: { deliverableType: MappedTask['deliverableType'] }) {
  if (deliverableType !== 'ad') return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 7,
      color: '#7c3aed', background: '#f1e9fe', whiteSpace: 'nowrap' as const,
    }}>
      Ad
    </span>
  );
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

  const [tasksResult, [clientRecord], priorityRows] = await Promise.all([
    getTasksFromList(process.env.CLICKUP_LIST_ID!, false).then(
      value => ({ value, error: null as string | null }),
      (e: unknown) => ({ value: [] as MappedTask[], error: e instanceof Error ? e.message : 'Unknown error' }),
    ),
    db.select({ id: clients.id, showCalendar: clients.showCalendar, showInvoices: clients.showInvoices, showReport: clients.showReport }).from(clients).where(eq(clients.name, clientName)).limit(1),
    db.select({ clickupTaskId: videoPriorities.clickupTaskId, rank: videoPriorities.rank }).from(videoPriorities).where(eq(videoPriorities.clientName, clientName)),
  ]);
  const allTasks = tasksResult.value;
  const fetchError = tasksResult.error;
  const showCalendar = clientRecord?.showCalendar ?? false;
  const priorityRank = new Map(priorityRows.map(r => [r.clickupTaskId, r.rank]));

  // Report contract data (§5.6/§7.1) — every period on file for this client
  // (including a joint contract they're part of, via contract_period_clients
  // — falling back to the legacy direct clientId column for any period PR 1's
  // backfill hasn't reached) plus their deviation-only contract_months rows,
  // so the report's month selector can resolve the right agreement for
  // whichever month is chosen, the same way the dashboard's month mode does.
  const reportPeriods = clientRecord?.id
    ? await (async () => {
        const [viaJoin, viaLegacyColumn] = await Promise.all([
          db.select({ periodId: contractPeriodClients.periodId }).from(contractPeriodClients).where(eq(contractPeriodClients.clientId, clientRecord.id)),
          db.select({ id: contractPeriods.id }).from(contractPeriods).where(eq(contractPeriods.clientId, clientRecord.id)),
        ]);
        const periodIds = [...new Set([...viaJoin.map(r => r.periodId), ...viaLegacyColumn.map(r => r.id)])];
        return periodIds.length > 0
          ? db.select().from(contractPeriods).where(inArray(contractPeriods.id, periodIds)).orderBy(contractPeriods.startsOn)
          : [];
      })()
    : [];
  const reportMonthRows = reportPeriods.length > 0
    ? await db.select().from(contractMonths).where(inArray(contractMonths.periodId, reportPeriods.map(p => p.id)))
    : [];
  const quickbooksConnected = isQuickBooksConfigured();
  // Only surface the Invoices tab once QuickBooks is actually wired up — otherwise
  // clients would see a tab full of labeled "sample data" as if it were real.
  const showInvoices = (clientRecord?.showInvoices ?? false) && quickbooksConnected;
  const showReport = clientRecord?.showReport ?? false;

  const clientInvoices = showInvoices ? await getInvoicesForClient(clientName) : [];
  const effectiveTab =
    (tab === 'invoices' && !showInvoices) || (tab === 'calendar' && !showCalendar) || (tab === 'report' && !showReport)
      ? 'reviews'
      : tab;

  const clientTasks = allTasks.filter(t => t.clientName === clientName);
  const reviewTasks = clientTasks.filter(t => norm(t.status) === 'for client review');
  // Keep postedTasks for the stats banner (monthly delivery counts)
  const postedTasks = clientTasks.filter(t => norm(t.status) === 'posted in socials');

  // ── Display groups (mutually exclusive, priority-ordered) ─────────────────
  // 1. Posted + Archived — sorted newest first
  const postedAndArchivedTasks = clientTasks
    .filter(t => ['posted in socials', 'archived'].includes(norm(t.status)))
    .sort((a, b) => {
      const dateA = a.publishDate ? new Date(a.publishDate).getTime() : (Number(a.dateUpdated) || 0);
      const dateB = b.publishDate ? new Date(b.publishDate).getTime() : (Number(b.dateUpdated) || 0);
      return dateB - dateA;
    });

  // 2. Scheduled — non-review, non-posted tasks that have a publish date set
  const scheduledTasks = clientTasks
    .filter(t => {
      const s = norm(t.status);
      return t.publishDate !== null && s !== 'for client review' && !['posted in socials', 'archived'].includes(s);
    })
    .sort((a, b) => new Date(a.publishDate!).getTime() - new Date(b.publishDate!).getTime());
  const scheduledIds = new Set(scheduledTasks.map(t => t.clickupTaskId));

  // 3. In Progress - Edition: all active production statuses (excluding scheduled)
  const IN_PROD_STATUSES = new Set([
    'in progress (editor)', 'in progress (corrections)', 'in tc/qc (somu)',
    'on its way', 'ready to be posted', 'approved · fixes pending',
  ]);
  const inEditionTasks = clientTasks
    .filter(t => IN_PROD_STATUSES.has(norm(t.status)) && !scheduledIds.has(t.clickupTaskId))
    // Unranked videos (no explicit client priority yet) sort after ranked
    // ones and keep their relative order (stable sort) — nothing jumps
    // around just because one video got a rank.
    .sort((a, b) => (priorityRank.get(a.clickupTaskId) ?? Infinity) - (priorityRank.get(b.clickupTaskId) ?? Infinity));

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
          <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:8, marginBottom:12}}>
            <div style={{fontWeight:700, fontSize:15, lineHeight:1.3}}><VideoTitle clientFacingTitle={t.clientFacingTitle} title={t.title} /></div>
            <AdBadge deliverableType={t.deliverableType} />
          </div>
          <div style={{background:'#fef3c7', color:'#92400e', textAlign:'center', padding:'6px', borderRadius:8, fontSize:12, fontWeight:600, marginBottom:12}}>⏳ Awaiting your review</div>
          <a href={`/client/videos/${t.clickupTaskId}`} style={{display:'block', textAlign:'center', padding:'10px', background:'#f97316', color:'#fff', borderRadius:10, fontWeight:600, fontSize:14, textDecoration:'none'}}>Watch &amp; review</a>
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
            <NotificationBell tasks={reviewTasks.map(t => ({ clickupTaskId: t.clickupTaskId, title: t.title, clientFacingTitle: t.clientFacingTitle, dateUpdated: t.dateUpdated }))} />
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
          </div>

          {fetchError && (
            <div style={{ background: '#fbe7e2', border: '1px solid #f8d0cc', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
              Error loading content: {fetchError}
            </div>
          )}

          {/* ── Reviews tab ── */}
          {effectiveTab === 'reviews' && <>
            {/* Needs review — prominent, no accordion */}
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

            {inEditionTasks.length > 0 && (
              <MobileAccordion label="📹 In Progress — Edition" count={inEditionTasks.length}>
                <div style={{ padding: '12px 0 4px' }}>
                  <PriorityReorderList items={inEditionTasks.map(t => ({ id: t.clickupTaskId, node: <VideoRow task={t} label={clientStatusLabel(t.status)} /> }))} />
                </div>
              </MobileAccordion>
            )}

            {scheduledTasks.length > 0 && (
              <MobileAccordion label="📅 Scheduled to Be Posted" count={scheduledTasks.length}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0 4px' }}>
                  {scheduledTasks.map(t => (
                    <VideoRow key={t.clickupTaskId} task={t} showViewLink
                      label={t.publishDate ? `Posts ${fmtDate(t.publishDate)}` : clientStatusLabel(t.status)}
                      color="#7c66c4" colorBg="#efeafa"
                    />
                  ))}
                </div>
              </MobileAccordion>
            )}

            {postedAndArchivedTasks.length > 0 && (
              <MobileAccordion label="✅ Posted on Socials" count={postedAndArchivedTasks.length}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0 4px' }}>
                  {postedAndArchivedTasks.map(t => (
                    <VideoRow key={t.clickupTaskId} task={t} showViewLink
                      label={t.publishDate ? `Posted ${fmtDate(t.publishDate)}` : 'Posted'}
                      color="#14805f" colorBg="#e4f3ec"
                    />
                  ))}
                </div>
              </MobileAccordion>
            )}

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
            <MonthlyReport
              clientName={clientName}
              periods={reportPeriods}
              monthRows={reportMonthRows}
              tasks={clientTasks.map(t => ({
                clickupTaskId: t.clickupTaskId,
                title: t.clientFacingTitle || t.title,
                status: t.status,
                deliverableType: t.deliverableType,
                datePosted: t.publishDate ?? t.dateUpdated,
                frameLink: t.frameLink,
                instagramUrl: t.instagramUrl,
              }))}
            />
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
            <NotificationBell tasks={reviewTasks.map(t => ({ clickupTaskId: t.clickupTaskId, title: t.title, clientFacingTitle: t.clientFacingTitle, dateUpdated: t.dateUpdated }))} />
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
                count: inEditionTasks.length,
                reelCount: inEditionTasks.filter(t => !t.isYoutube).length,
                youtubeCount: inEditionTasks.filter(t => t.isYoutube).length,
                color:'#60a5fa',
                tasks: inEditionTasks,
              },
            ]} />
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

            {inEditionTasks.length > 0 && (
              <DesktopAccordion label="📹 In Progress — Edition" count={inEditionTasks.length} style={{marginBottom:16}}>
                <PriorityReorderList items={inEditionTasks.map(t => ({ id: t.clickupTaskId, node: <DesktopStatusRow t={t} /> }))} />
              </DesktopAccordion>
            )}

            {scheduledTasks.length > 0 && (
              <DesktopAccordion label="📅 Scheduled to Be Posted" count={scheduledTasks.length} style={{marginBottom:16}}>
                {scheduledTasks.map(t => (
                  <div key={t.clickupTaskId} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #e8e0d0'}}>
                    <div style={{width:40,height:40,borderRadius:8,background:'#2a2520',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎬</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600, fontSize:14}} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
                    </div>
                    {t.publishDate && <span style={{background:'#efeafa', color:'#7c66c4', fontSize:12, padding:'3px 10px', borderRadius:12, fontWeight:700}}>Posts {fmtDate(t.publishDate)}</span>}
                    <Link href={`/client/videos/${t.clickupTaskId}`} style={{fontSize:12, color:'#FF6000', textDecoration:'none', fontWeight:600}}>View →</Link>
                  </div>
                ))}
              </DesktopAccordion>
            )}

            {postedAndArchivedTasks.length > 0 && (
              <DesktopAccordion label="✅ Posted on Socials" count={postedAndArchivedTasks.length} style={{marginBottom:16}}>
                {postedAndArchivedTasks.map(t => (
                  <div key={t.clickupTaskId} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom:'1px solid #e8e0d0'}}>
                    <div style={{width:40,height:40,borderRadius:8,background:'#2a2520',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>🎬</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600, fontSize:14}} title={t.clientFacingTitle || t.title}>{displayTitle(t.clientFacingTitle, t.title)}</div>
                    </div>
                    <span style={{background:'#e4f3ec', color:'#14805f', fontSize:12, padding:'3px 10px', borderRadius:12, fontWeight:700}}>
                      {t.publishDate ? `Posted ${fmtDate(t.publishDate)}` : 'Posted'}
                    </span>
                    {t.instagramUrl && <InstagramLink url={t.instagramUrl} label="Instagram" compact />}
                    <Link href={`/client/videos/${t.clickupTaskId}`} style={{fontSize:12, color:'#FF6000', textDecoration:'none', fontWeight:600}}>View →</Link>
                  </div>
                ))}
              </DesktopAccordion>
            )}
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
          <MonthlyReport
            clientName={clientName}
            periods={reportPeriods}
            monthRows={reportMonthRows}
            tasks={clientTasks.map(t => ({
              clickupTaskId: t.clickupTaskId,
              title: t.clientFacingTitle || t.title,
              status: t.status,
              deliverableType: t.deliverableType,
              datePosted: t.publishDate ?? t.dateUpdated,
              frameLink: t.frameLink,
              instagramUrl: t.instagramUrl,
            }))}
          />
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

function MobileAccordion({ label, count, children }: { label: string; count: number; children: React.ReactNode }) {
  return (
    <details style={{ border: '1px solid #ece4d8', borderRadius: 16, background: '#fff', overflow: 'hidden' }}>
      <summary style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '13px 15px', cursor: 'pointer', listStyle: 'none',
        fontSize: 14, fontWeight: 800, letterSpacing: '-0.01em', userSelect: 'none',
      }}>
        <span>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#9d9488', background: '#f5f2ef', padding: '2px 8px', borderRadius: 100 }}>{count}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 14, height: 14, color: '#9d9488' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div style={{ padding: '0 15px 12px' }}>{children}</div>
    </details>
  );
}

function DesktopAccordion({ label, count, children, style }: { label: string; count: number; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <details style={{ border: '1px solid #e8e0d0', borderRadius: 14, background: '#fff', overflow: 'hidden', ...style }}>
      <summary style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px', cursor: 'pointer', listStyle: 'none',
        fontSize: 17, fontWeight: 700, userSelect: 'none',
      }}>
        <span>{label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#9d9488', background: '#f5f2ef', padding: '3px 10px', borderRadius: 100 }}>{count}</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ width: 16, height: 16, color: '#9d9488' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </span>
      </summary>
      <div style={{ padding: '0 20px 16px' }}>{children}</div>
    </details>
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
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25 }}>
            <VideoTitle clientFacingTitle={task.clientFacingTitle} title={task.title} />
          </div>
          <AdBadge deliverableType={task.deliverableType} />
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
        <div style={{fontWeight:600, fontSize:14}}><VideoTitle clientFacingTitle={t.clientFacingTitle} title={t.title} /></div>
      </div>
      <AdBadge deliverableType={t.deliverableType} />
      <span style={{background:bg, color, fontSize:12, padding:'3px 10px', borderRadius:12, fontWeight:700}}>{clientStatusLabel(t.status)}</span>
      {t.instagramUrl && <InstagramLink url={t.instagramUrl} label="Instagram" compact />}
      {showViewLink && (
        <Link href={`/client/videos/${t.clickupTaskId}`} className="video-action-btn video-action-watch" style={{ fontSize: 12, padding: '6px 12px' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
            <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Watch video
        </Link>
      )}
      {t.rawDriveLink && (
        <a
          href={t.rawDriveLink} target="_blank" rel="noopener noreferrer"
          title="The original unedited file this video was made from"
          className="video-action-btn video-action-raw" style={{ fontSize: 12, padding: '6px 12px' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
            <path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>
          </svg>
          Original footage
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
      display: 'flex', alignItems: 'flex-start', gap: 12,
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
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {/* Full title on its own line — nothing else competes with it for
            width, so long titles wrap instead of getting cut off. */}
        <div style={{ fontSize: 13.5, fontWeight: 700, lineHeight: 1.3 }}>
          <VideoTitle clientFacingTitle={task.clientFacingTitle} title={task.title} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <AdBadge deliverableType={task.deliverableType} />
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontSize: 12, fontWeight: 700, padding: '5px 9px', borderRadius: 9,
            color: fg, background: bg, whiteSpace: 'nowrap' as const,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />
            {label ?? clientStatusLabel(task.status)}
          </span>
          {task.instagramUrl && <InstagramLink url={task.instagramUrl} label="Instagram" compact />}
          {showViewLink && (
            <Link href={`/client/videos/${task.clickupTaskId}`} className="video-action-btn video-action-watch" style={{ fontSize: 11.5, padding: '6px 11px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
                <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              Watch video
            </Link>
          )}
          {task.rawDriveLink && (
            <a
              href={task.rawDriveLink} target="_blank" rel="noopener noreferrer"
              title="The original unedited file this video was made from"
              className="video-action-btn video-action-raw" style={{ fontSize: 11.5, padding: '6px 11px' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:12,height:12}}>
                <path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>
              </svg>
              Original footage
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
