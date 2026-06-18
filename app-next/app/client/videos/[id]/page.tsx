import { redirect, notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';
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
  if (!task) {
    const anyTask = allTasks.find(t => t.clickupTaskId === id);
    if (anyTask) {
      return (
        <main style={{ minHeight: '100vh', background: '#faf6f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: '32px 28px', maxWidth: 420, border: '1px solid #ece4d8' }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#221e18', margin: '0 0 10px' }}>Access mismatch</h2>
            <p style={{ fontSize: 13, color: '#6c6357', lineHeight: 1.6, margin: '0 0 16px' }}>
              Your account is linked to client <strong>{userRow.clientName ?? '(none)'}</strong>, but this video belongs to client <strong>{anyTask.clientName ?? '(none)'}</strong>.
            </p>
            <p style={{ fontSize: 12, color: '#9d9488', margin: 0 }}>Contact your account manager to fix your portal access.</p>
          </div>
        </main>
      );
    }
    notFound();
  }

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

      {/* Frame.io player — fills available height */}
      <div style={{ flex: 1, position: 'relative', background: '#1a1e24', margin: '0 0 0 0', minHeight: 0 }}>
        {embedUrl ? (
          <iframe
            src={embedUrl}
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', position: 'absolute', inset: 0 }}
            allow="fullscreen; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'linear-gradient(135deg, #2c3540, #4a5562)', position: 'absolute', inset: 0 }}>
            <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,.15)', display: 'grid', placeItems: 'center' }}>
              <svg viewBox="0 0 24 24" fill="#fff" style={{width:24,height:24,marginLeft:3}}><path d="M8 5v14l11-7z"/></svg>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,.5)', textAlign: 'center', padding: '0 24px' }}>No video link attached yet</div>
          </div>
        )}
      </div>

      {/* Meta + caption strip */}
      <div style={{ padding: '12px 16px', paddingBottom: isReview ? 0 : 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 9, color: isReview ? '#b06f06' : '#54616f', background: isReview ? '#fbeecf' : '#eef1f4' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: isReview ? '#b06f06' : '#54616f' }} />
            {isReview ? 'Awaiting your review' : task.status}
          </span>
          {task.frameLink && (
            <a href={task.frameLink} target="_blank" rel="noopener noreferrer" style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#6c6357', textDecoration: 'none' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:13,height:13}}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              Open in Frame.io
            </a>
          )}
        </div>
        <h1 style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.2, margin: 0 }}>{task.title}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6c6357', fontWeight: 500, flexWrap: 'wrap' as const }}>
          {task.assignedAmName && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#5e6b7a', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700 }}>{initials(task.assignedAmName)}</span>
              <span>AM · {task.assignedAmName}</span>
            </span>
          )}
          <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} />
          <span>{daysWaiting(task.dateUpdated)}</span>
          {task.dueDate && (<><span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} /><span>Due {fmtDate(task.dueDate)}</span></>)}
        </div>
        {task.caption && (
          <div style={{ background: '#f7f2ea', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Caption</div>
            <p style={{ fontSize: 13, color: '#6c6357', lineHeight: 1.5, margin: 0 }}>{task.caption}</p>
          </div>
        )}
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
