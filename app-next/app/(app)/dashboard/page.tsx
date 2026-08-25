import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isConfigured } from '@/lib/clickup';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { loadAdminRoster } from '@/lib/admin-roster';
import { PipelineCard } from '@/components/dashboard/PipelineCard';
import { ByClientTable } from '@/components/dashboard/ByClientTable';
import { PageHeader } from '@/components/layout/PageHeader';
import { T } from '@/components/ui/tokens';

export const revalidate = 60;

/**
 * Screen 1 — "what is stuck, and is it our fault or the client's?"
 *
 * Two cards, no KPI strip: the four KPI cards this page used to open with
 * restated the pipeline numbers directly below them, and the per-client
 * Backlog/Editing/QC/Review columns were six numbers a row that nobody summed.
 * Every figure here comes out of loadAdminRoster, the same load the Clients
 * page reads, so the two screens cannot report different totals.
 */
export default async function DashboardPage() {
  // The role check matters: a logged-in client-role user could otherwise hit
  // this URL directly (the sidebar only hides the link) and see every other
  // client's production data.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  if (!isConfigured()) {
    return (
      <main style={{ padding: 40 }}>
        <div style={{ background: '#fff', border: `1px solid ${T.line}`, borderRadius: 12, padding: '48px 40px', maxWidth: 500 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.ink, margin: '0 0 8px' }}>Configure ClickUp credentials</h2>
          <p style={{ fontSize: 14, color: T.ink2, margin: 0, lineHeight: 1.6 }}>
            Set <code>CLICKUP_API_TOKEN</code> and <code>CLICKUP_FOLDER_ID</code> in Netlify environment variables.
          </p>
        </div>
      </main>
    );
  }

  // Inactive clients are always hidden here and counted in the table footer —
  // the global "Show inactive" toggle lived on this page but nobody flipped it
  // daily, so it moved to Clients where the roster is the subject.
  const { rows, totals, inactiveCount, error } = await loadAdminRoster();

  return (
    <main style={{ maxWidth: 1400 }}>
      <PageHeader title="Main Dashboard" />

      {error && (
        <div style={{ margin: '18px 34px 0' }}>
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: T.danger }}>
            ClickUp error: {error}
          </div>
        </div>
      )}

      <div className="db-page-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <PipelineCard
          stages={totals.stages}
          stalled={totals.stalledStages}
          posted={totals.posted}
          inFlight={totals.inFlight}
          stalledWithUs={totals.stalledWithUs}
          waitingOnClient={totals.waitingOnClient}
        />
        <ByClientTable rows={rows} inactiveCount={inactiveCount} />
      </div>
    </main>
  );
}
