import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';
import { VideoComments } from '@/components/client/VideoComments';
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

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Convert a Frame.io share URL to an embeddable URL
function toFrameioEmbedUrl(url: string): string {
  // Handles: https://f.io/xxxxx or https://app.frame.io/reviews/xxxxx or https://on.frame.io/...
  // Frame.io embed format: https://app.frame.io/reviews/{token}/embed
  if (!url) return '';
  const cleaned = url.trim();
  if (cleaned.includes('/embed')) return cleaned;
  // Short links (f.io) — pass through; the iframe will follow the redirect
  return `${cleaned.replace(/\/$/, '')}`;
}

export default async function VideoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, name: authUsers.name })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow || userRow.role !== 'client') redirect('/dashboard');
  if (!userRow.clientName) redirect('/client');

  const allTasks = await getTasksFromList(process.env.CLICKUP_LIST_ID!, false);
  const task = allTasks.find(t => t.clickupTaskId === id && t.clientName === userRow.clientName);
  if (!task) notFound();

  const isReview = task.status.toLowerCase().includes('client review');
  const embedUrl = task.frameLink ? toFrameioEmbedUrl(task.frameLink) : null;

  return (
    <main style={{ minHeight: '100vh', background: '#faf6f0', fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, sans-serif', color: '#221e18', fontSize: 15, WebkitFontSmoothing: 'antialiased' as const, display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
        <Link href="/client" style={{ width: 40, height: 40, borderRadius: 12, background: '#fff', border: '1px solid #ece4d8', display: 'grid', placeItems: 'center', color: '#221e18', textDecoration: 'none' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}><path d="m15 18-6-6 6-6"/></svg>
        </Link>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Review video</div>
        <div style={{ width: 40 }} />
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 16px', paddingBottom: isReview ? 120 : 32, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Player */}
        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#1a1e24', aspectRatio: '16/9' as const }}>
          {embedUrl ? (
            <iframe
              src={embedUrl}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              allow="fullscreen; picture-in-picture"
              allowFullScreen
            />
          ) : (
            // Fallback placeholder if no frame link
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'linear-gradient(135deg, #2c3540, #4a5562)' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center' }}>
                <svg viewBox="0 0 24 24" fill="#fff" style={{width:24,height:24,marginLeft:3}}><path d="M8 5v14l11-7z"/></svg>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', textAlign: 'center', padding: '0 24px' }}>No video link attached yet</div>
            </div>
          )}
          <span style={{ position: 'absolute', top: 10, left: 11, background: 'rgba(12,14,17,.65)', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,.15)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5, pointerEvents: 'none' }}>
            <span style={{ width: 6, height: 6, borderRadius: 2, background: '#5b9dff' }} />Frame.io
          </span>
          {task.frameLink && (
            <a href={task.frameLink} target="_blank" rel="noopener noreferrer" style={{ position: 'absolute', top: 10, right: 11, background: 'rgba(12,14,17,.65)', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,.15)', color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5, textDecoration: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:11,height:11}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open
            </a>
          )}
        </div>

        {/* Title + meta */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const, marginBottom: 8 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 9, color: isReview ? '#b06f06' : '#54616f', background: isReview ? '#fbeecf' : '#eef1f4' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isReview ? '#b06f06' : '#54616f' }} />
              {isReview ? 'Awaiting your review' : task.status}
            </span>
            {task.videoLevel && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 9, color: '#54616f', background: '#f7f2ea' }}>{task.videoLevel}</span>
            )}
          </div>
          <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2, margin: '0 0 8px' }}>{task.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#6c6357', fontWeight: 500, flexWrap: 'wrap' as const }}>
            {task.assignedAmName && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#5e6b7a', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 700 }}>{initials(task.assignedAmName)}</span>
                {task.assignedAmName}
              </span>
            )}
            <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} />
            <span>{daysWaiting(task.dateUpdated)}</span>
            {task.dueDate && (<><span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} /><span>Due {fmtDate(task.dueDate)}</span></>)}
          </div>
        </div>

        {/* Caption */}
        {task.caption && (
          <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 6 }}>Caption</div>
            <p style={{ fontSize: 13.5, color: '#6c6357', lineHeight: 1.55, margin: 0 }}>{task.caption}</p>
          </div>
        )}

        {/* Comments */}
        <VideoComments taskId={task.clickupTaskId} frameLink={task.frameLink} />
      </div>

      {/* Approval dock */}
      {isReview && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #ece4d8', padding: '13px 18px calc(13px + env(safe-area-inset-bottom,0px))', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 100 }}>
          <ApprovalButtons taskId={task.clickupTaskId} currentApproval={task.clientApproval} />
        </div>
      )}
    </main>
  );
}
