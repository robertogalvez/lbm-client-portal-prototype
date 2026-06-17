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
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysWaiting(dateUpdated: string) {
  return Math.floor((Date.now() - new Date(dateUpdated).getTime()) / 86_400_000);
}

function greeting(name: string) {
  const h = new Date().getHours();
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  return `Good ${time}, ${name.split(' ')[0]}`;
}

export default async function ClientPortalPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  // Load from DB to get role + clientName (session may not carry additionalFields)
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
      <div style={{ minHeight: '100vh', background: '#f4f6f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 16, padding: '40px 32px', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111c28', margin: '0 0 8px' }}>Account not fully set up</h2>
          <p style={{ fontSize: 14, color: '#54616f', margin: 0, lineHeight: 1.6 }}>
            Your account hasn't been linked to a client yet. Please contact your account manager.
          </p>
        </div>
      </div>
    );
  }

  let allTasks: MappedTask[] = [];
  let error: string | null = null;
  try {
    allTasks = await getTasksFromList(process.env.CLICKUP_LIST_ID!, false);
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  const clientTasks = allTasks.filter(t => t.clientName === clientName);
  const reviewTasks = clientTasks.filter(t => norm(t.status) === 'for client review');
  const postedTasks = clientTasks.filter(t => norm(t.status) === 'posted in socials');
  const inProgress  = clientTasks.filter(t => !['for client review', 'posted in socials', 'ready to be posted'].includes(norm(t.status)));
  const monthStart  = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const postedThisMonth = postedTasks.filter(t => new Date(t.dateUpdated).getTime() >= monthStart).length;

  return (
    <div style={{ minHeight: '100vh', background: '#f4f6f8' }}>
      {/* Header */}
      <div style={{ background: '#101a26', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{
            fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em',
            background: 'linear-gradient(100deg, #FF6000 0%, #FF3D14 55%, #F5232B 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            Legacy Building Media
          </span>
          <div style={{ fontSize: 11, color: '#8b97a4', letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 2 }}>
            Client Portal
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#8b97a4' }}>{session.user.email}</div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '28px 16px' }}>

        {/* Greeting */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111c28', margin: 0 }}>
            {greeting(name ?? clientName)}
          </h1>
          <p style={{ fontSize: 14, color: '#54616f', margin: '4px 0 0' }}>
            Here's what's happening with your content.
          </p>
        </div>

        {error && (
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#cf3f36' }}>
            Error loading content: {error}
          </div>
        )}

        {/* KPI strip */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 28 }}>
          {[
            { label: 'Needs Review', value: reviewTasks.length, accent: '#ffc53d' },
            { label: 'In Production', value: inProgress.length, accent: '#1090e0' },
            { label: 'Posted This Month', value: postedThisMonth, accent: '#30a46c' },
          ].map(({ label, value, accent }) => (
            <div key={label} style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, padding: '16px', borderTop: `3px solid ${accent}` }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: '#111c28' }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Videos awaiting review */}
        {reviewTasks.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
              Needs Your Review
              <span style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: '#ffc53d', padding: '2px 8px', borderRadius: 10 }}>
                {reviewTasks.length}
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviewTasks.map(t => (
                <div key={t.clickupTaskId} style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, color: '#111c28', margin: 0, lineHeight: 1.4 }}>
                      {t.title}
                    </h3>
                    {t.videoLevel && (
                      <span style={{ fontSize: 11, color: '#8b97a4', background: '#f4f6f8', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {t.videoLevel}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginBottom: 14 }}>
                    Waiting {daysWaiting(t.dateUpdated)} day{daysWaiting(t.dateUpdated) !== 1 ? 's' : ''} for review
                    {t.dueDate && ` · Due ${fmtDate(t.dueDate)}`}
                  </div>
                  {t.caption && (
                    <div style={{ fontSize: 13, color: '#54616f', background: '#f8f9fb', borderRadius: 8, padding: '12px', marginBottom: 14, lineHeight: 1.5 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>Caption</div>
                      {t.caption}
                    </div>
                  )}
                  <ApprovalButtons taskId={t.clickupTaskId} currentApproval={t.clientApproval} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* In production */}
        {inProgress.length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: '0 0 14px' }}>In Production</h2>
            <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, overflow: 'hidden' }}>
              {inProgress.map((t, i) => (
                <div key={t.clickupTaskId} style={{
                  padding: '14px 20px',
                  borderBottom: i < inProgress.length - 1 ? '1px solid #f4f6f8' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111c28', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#1090e0', background: '#e6f2fc', padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {t.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recently posted */}
        {postedTasks.length > 0 && (
          <section>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: '0 0 14px' }}>Recently Posted</h2>
            <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, overflow: 'hidden' }}>
              {postedTasks.slice(0, 10).map((t, i) => (
                <div key={t.clickupTaskId} style={{
                  padding: '14px 20px',
                  borderBottom: i < Math.min(postedTasks.length, 10) - 1 ? '1px solid #f4f6f8' : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111c28', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </div>
                  <span style={{ fontSize: 11, color: '#8b97a4', whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {fmtDate(t.dateUpdated)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {clientTasks.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#8b97a4' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🎬</div>
            <p style={{ fontSize: 14, margin: 0 }}>No videos found for your account yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
