import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';
import { ReviewTabs, TabPanel } from '@/components/client/ReviewTabs';
import { CaptionCard } from '@/components/client/CaptionCard';
import { VideoDecisionProvider } from '@/components/client/VideoDecisionContext';
import { ViewAsBanner } from '@/components/admin/ViewAsBanner';
import { getViewAsClient } from '@/lib/view-as';
import { InstagramLink } from '@/components/InstagramLink';
import { clientStatusLabel } from '@/lib/client-status';
import Link from 'next/link';
export const dynamic = 'force-dynamic';

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysWaiting(dateUpdated: string) {
  const ts = Number(dateUpdated);
  const date = isNaN(ts) ? new Date(dateUpdated) : new Date(ts);
  const d = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (isNaN(d)) return '';
  return d === 0 ? 'Today' : d === 1 ? 'Yesterday' : `${d}d ago`;
}

function toFrameioEmbedUrl(url: string): string {
  if (!url) return '';
  const cleaned = url.trim();
  if (cleaned.includes('/embed')) return cleaned;
  return `${cleaned.replace(/\/$/, '')}`;
}

export default async function VideoDetailPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams: Promise<{ from?: string }> }) {
  const { id } = await params;
  const { from } = await searchParams;

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
  const canAccess = userRow?.role === 'client' || userRow?.isAlsoClient || !!viewAsClient;
  if (!userRow || !canAccess) redirect('/dashboard');

  const effectiveClientName = viewAsClient ? viewAsClient.name : userRow.clientName;
  if (!effectiveClientName) redirect('/client');

  const allTasks = await getTasksFromList(process.env.CLICKUP_LIST_ID!, false);
  const task = allTasks.find(t => t.clickupTaskId === id && t.clientName === effectiveClientName);
  if (!task) {
    const anyTask = allTasks.find(t => t.clickupTaskId === id);
    if (anyTask) {
      return (
        <main style={{ minHeight: '100vh', background: '#faf6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 420, border: '1px solid #ece4d8' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#221e18', margin: '0 0 10px' }}>Access mismatch</h2>
            <p style={{ fontSize: 13, color: '#6c6357', lineHeight: 1.6, margin: '0 0 16px' }}>
              {viewAsClient ? "You're viewing" : 'Your account is linked to'} client <strong>{effectiveClientName ?? '(none)'}</strong>, but this video belongs to client <strong>{anyTask.clientName ?? '(none)'}</strong>.
            </p>
            <p style={{ fontSize: 12, color: '#9d9488', margin: 0 }}>Contact your account manager to fix your portal access.</p>
          </div>
        </main>
      );
    }
    notFound();
  }

  const normStatus = task.status.toLowerCase().replace(/\s+/g, ' ').trim();
  const isReview = normStatus.includes('client review');
  const isHeld = (task.clientApproval ?? '').toLowerCase().trim() === 'approved with comments';
  const embedUrl = task.frameLink ? toFrameioEmbedUrl(task.frameLink) : null;
  const hasCaption = !!task.caption;

  const metaPanel = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
        <div className="vd-meta-hide-mobile">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 9, color: isReview ? '#b06f06' : '#54616f', background: isReview ? '#fbeecf' : '#eef1f4' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isReview ? '#b06f06' : '#54616f' }} />
            {isReview ? 'Awaiting your review' : task.status}
          </span>
        </div>
        {task.frameLink && (
          <a href={task.frameLink} target="_blank" rel="noopener noreferrer" className="vd-open-frameio-desktop" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#6c6357', textDecoration: 'none' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Open in Frame.io
          </a>
        )}
      </div>
      <div className="vd-meta-hide-mobile">
        <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2, margin: 0 }}>{task.clientFacingTitle || task.title}</h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6c6357', fontWeight: 500, flexWrap: 'wrap' as const }}>
        <span>{daysWaiting(task.dateUpdated)}</span>
        {task.dueDate && (<><span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} /><span>Due {fmtDate(task.dueDate)}</span></>)}
      </div>

      {task.instagramUrl && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fdf2f8', border: '1px solid #f5d0e6', borderRadius: 10, padding: '10px 12px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#9d4a7a' }}>Published</span>
          <InstagramLink url={task.instagramUrl} style={{ marginLeft: 'auto' }} />
        </div>
      )}
    </>
  );

  const player = embedUrl ? (
    <iframe src={embedUrl} style={{ width: '100%', height: '100%', border: 'none', display: 'block', position: 'absolute', inset: 0 }} allow="fullscreen; picture-in-picture" allowFullScreen />
  ) : (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'linear-gradient(135deg, #2c3540, #4a5562)' }}>
      <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 24 24" fill="#fff" style={{width:24,height:24,marginLeft:3}}><path d="M8 5v14l11-7z"/></svg>
      </div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', textAlign: 'center', padding: '0 24px' }}>No video link attached yet</div>
    </div>
  );

  const backHref = from === 'calendar' ? '/client?tab=calendar' : '/client';
  const backLink = (
    <Link href={backHref} style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center', color: '#fff', textDecoration: 'none', flexShrink: 0 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><path d="m15 18-6-6 6-6"/></svg>
    </Link>
  );

  const statusColor = isReview ? '#b06f06' : '#54616f';
  const statusBg = isReview ? '#fbeecf' : '#eef1f4';
  const statusLabel = clientStatusLabel(task.status);

  const shell = (
    <main className="vd-shell">
      {/* Mobile-only header */}
      <div className="vd-mobile-header">
        <Link href={backHref} style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: '1px solid #ece4d8', display: 'grid', placeItems: 'center', color: '#221e18', textDecoration: 'none', flexShrink: 0 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><path d="m15 18-6-6 6-6"/></svg>
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
            {task.clientFacingTitle || task.title}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, padding: '1px 7px', borderRadius: 7, color: statusColor, background: statusBg, marginTop: 2 }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor }} />
            {statusLabel}
          </span>
        </div>
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      <ReviewTabs hasCaption={hasCaption}>
        {/* Video tab panel (or the only content when no caption) */}
        <TabPanel tab="video" className="vd-video-panel">
          {/* Desktop back/title overlay — positioned absolute over the video */}
          <div className="vd-left-header">
            {backLink}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', opacity: 0.9 }}>Review video</div>
            <div style={{ width: 36 }} />
          </div>
          {/* Mobile: Open in Frame.io link inside the video tab */}
          {task.frameLink && (
            <div className="vd-frameio-strip">
              <a href={task.frameLink} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#6c6357', textDecoration: 'none' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                Open in Frame.io
              </a>
            </div>
          )}
          <div className="vd-player">{player}</div>
        </TabPanel>

        {/* Caption tab panel — mobile only, desktop shows it in the rail */}
        {hasCaption && (
          <TabPanel tab="caption" className="vd-caption-panel">
            <div style={{ padding: '16px' }}>
              <CaptionCard caption={task.caption!} />
            </div>
          </TabPanel>
        )}
      </ReviewTabs>

      {/* Right rail: meta + caption (desktop) + dock */}
      <div className="vd-right">
        <div className="vd-right-header">
          <span style={{ fontSize: 12, color: '#9d9488', fontWeight: 500 }}>{from === 'calendar' ? 'Calendar' : 'Reviews'}</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Details</span>
        </div>

        <div className="vd-right-scroll">
          <div className="vd-meta">{metaPanel}</div>

          {/* Desktop caption card — hidden on mobile (caption tab handles it) */}
          {hasCaption && (
            <div className="vd-desktop-caption" style={{ padding: '0 20px 16px' }}>
              <CaptionCard caption={task.caption!} />
            </div>
          )}
        </div>

        {isReview && (
          <div className="vd-dock">
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Finish your review</div>
            <ApprovalButtons taskId={task.clickupTaskId} currentApproval={task.clientApproval} />
          </div>
        )}

        {isHeld && (
          <div className="vd-dock">
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Fixes in progress</div>
            {task.clientFixesChecklist ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 100, background: '#f0e8df', overflow: 'hidden' }}>
                    <div style={{
                      width: `${task.clientFixesChecklist.total > 0 ? Math.round(task.clientFixesChecklist.resolved / task.clientFixesChecklist.total * 100) : 0}%`,
                      height: '100%', background: '#8a6200',
                    }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#8a6200', flexShrink: 0 }}>
                    {task.clientFixesChecklist.resolved} / {task.clientFixesChecklist.total}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#9d9488', margin: 0 }}>We&apos;ll bring it back to you to confirm once these are done.</p>
              </>
            ) : (
              <p style={{ fontSize: 13, color: '#6c6357', margin: 0 }}>
                Your fixes are queued with the team. We&apos;ll bring it back to you to confirm once they&apos;re done.
              </p>
            )}
          </div>
        )}
      </div>

    </main>
  );

  return (
    <>
    {viewAsClient && <ViewAsBanner clientName={viewAsClient.name} />}
    <VideoDecisionProvider initialDecided={!!task.clientApproval}>
      {shell}
    </VideoDecisionProvider>
    </>
  );
}
