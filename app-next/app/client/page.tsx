import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getTasksFromList } from '@/lib/clickup';
import type { MappedTask } from '@/lib/clickup';
import { ApprovalButtons } from '@/components/client/ApprovalButtons';

export const dynamic = 'force-dynamic';

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

const IconBell = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>
  </svg>
);
const IconPlay = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" style={{width:18,height:18,marginLeft:2}}>
    <path d="M8 5v14l11-7z"/>
  </svg>
);

export default async function ClientPortalPage() {
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

  return (
    <main style={{
      minHeight: '100vh',
      background: '#faf6f0',
      fontFamily: '"Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", sans-serif',
      color: '#221e18',
      fontSize: 15,
      WebkitFontSmoothing: 'antialiased' as const,
      lineHeight: 1.45,
    }}>
      {/* App header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, background: '#FF6000',
            display: 'grid', placeItems: 'center',
            color: '#fff', fontWeight: 800, fontSize: 12, letterSpacing: '-0.02em', flexShrink: 0,
          }}>LBM</div>
          <div>
            <div style={{ fontSize: 12, color: '#9d9488', fontWeight: 600 }}>Welcome back</div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.1 }}>{displayName}</div>
          </div>
        </div>
        <button style={{
          width: 40, height: 40, borderRadius: 12, background: '#fff',
          border: '1px solid #ece4d8', display: 'grid', placeItems: 'center',
          color: '#6c6357', cursor: 'pointer',
        }}>
          <IconBell />
        </button>
      </div>

      {/* Scrollable body */}
      <div style={{ padding: '4px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Package / pipeline banner */}
        <div style={{
          background: '#221e18', color: '#fff', borderRadius: 20,
          padding: '16px 18px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 12,
        }}>
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
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>
                {reviewTasks.length}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,.6)', fontWeight: 600 }}>to review</div>
            </div>
            <div style={{
              width: 46, height: 46, borderRadius: '50%',
              background: `conic-gradient(#FF6000 ${pct}%, rgba(255,255,255,.16) 0)`,
              display: 'grid', placeItems: 'center',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', background: '#221e18',
                display: 'grid', placeItems: 'center',
                fontSize: 11, fontWeight: 800, color: '#fff',
              }}>
                {postedThisMonth}
              </div>
            </div>
          </div>
        </div>

        {fetchError && (
          <div style={{ background: '#fbe7e2', border: '1px solid #f8d0cc', borderRadius: 12, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
            Error loading content: {fetchError}
          </div>
        )}

        {/* Needs Review */}
        {reviewTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>
              Needs your review
              <span style={{ fontSize: 12, fontWeight: 700, color: '#b06f06', background: '#fbeecf', padding: '2px 9px', borderRadius: 100, fontVariantNumeric: 'tabular-nums' as const }}>
                {reviewTasks.length}
              </span>
            </div>
            {reviewTasks.map(t => (
              <VideoReviewCard key={t.clickupTaskId} task={t} />
            ))}
          </div>
        )}

        {/* In production */}
        {inProgress.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0' }}>
              In production
            </div>
            {inProgress.map(t => (
              <VideoRow key={t.clickupTaskId} task={t} color="#2563eb" colorBg="#e8eefc" />
            ))}
          </div>
        )}

        {/* Recently posted */}
        {postedTasks.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.01em', padding: '2px 2px 0', marginTop: 4 }}>
              Recently reviewed
            </div>
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

      {/* Tab bar */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        height: 76, background: '#fff', borderTop: '1px solid #ece4d8',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-around',
        padding: '11px 12px 0', zIndex: 100,
      }}>
        {[
          { label: 'Reviews', badge: reviewTasks.length, active: true, icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
          )},
          { label: 'Calendar', badge: 0, active: false, icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          )},
          { label: 'Account', badge: 0, active: false, icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:22,height:22}}><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 12 0v1"/></svg>
          )},
        ].map(({ label, badge, active, icon }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            fontSize: 10.5, fontWeight: 700,
            color: active ? '#B23E00' : '#9d9488',
            position: 'relative', padding: '2px 14px',
          }}>
            {icon}
            {badge > 0 && (
              <span style={{
                position: 'absolute', top: -2, right: 6,
                minWidth: 16, height: 16,
                background: '#cf3f36', color: '#fff',
                fontSize: 10, fontWeight: 800,
                borderRadius: 100, display: 'grid', placeItems: 'center',
                padding: '0 4px', border: '1.5px solid #fff',
              }}>{badge}</span>
            )}
            {label}
          </div>
        ))}
      </nav>
    </main>
  );
}

function VideoReviewCard({ task }: { task: MappedTask }) {
  const waiting = Math.floor((Date.now() - new Date(task.dateUpdated).getTime()) / 86_400_000);
  return (
    <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 22, overflow: 'hidden' }}>
      {/* Thumbnail */}
      <div style={{
        position: 'relative', aspectRatio: '16/10' as const,
        background: 'linear-gradient(135deg, #2c3540, #4a5562)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {task.videoLevel && (
          <span style={{
            position: 'absolute', top: 10, left: 10,
            background: 'rgba(12,14,17,.62)', backdropFilter: 'blur(4px)',
            color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 9px', borderRadius: 8,
          }}>{task.videoLevel}</span>
        )}
        <div style={{
          width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,.92)',
          display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px rgba(0,0,0,.25)',
          color: '#221e18',
        }}>
          <IconPlay />
        </div>
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
              {task.assignedAmName}
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
        <button style={{
          width: '100%', padding: '15px', borderRadius: 15, border: 'none',
          background: '#FF6000', color: '#fff', fontWeight: 700, fontSize: 15,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'inherit',
        }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16}}>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Watch &amp; review
        </button>

        <ApprovalButtons taskId={task.clickupTaskId} currentApproval={task.clientApproval} />
      </div>
    </div>
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
