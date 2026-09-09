import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { isConfigured } from '@/lib/clickup';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractPeriodClients, contractLineItems, contractMonths } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { loadAdminRoster } from '@/lib/admin-roster';
import { PipelineCard } from '@/components/dashboard/PipelineCard';
import { PageHeader } from '@/components/layout/PageHeader';
import { T } from '@/components/ui/tokens';
import { ClientsPageClient } from '../admin/clients/ClientsPageClient';

export const revalidate = 60;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
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

  const { client = '' } = await searchParams;

  const [roster, allClients, allPeriods, allPeriodClients] = await Promise.all([
    loadAdminRoster(),
    db.select().from(clients).orderBy(clients.createdAt),
    db.select().from(contractPeriods),
    db.select().from(contractPeriodClients),
  ]);

  const periodIds = allPeriods.map(p => p.id);
  const [allMonths, allLineItems] = periodIds.length > 0
    ? await Promise.all([
        db.select().from(contractMonths).where(inArray(contractMonths.periodId, periodIds)),
        db.select().from(contractLineItems).where(inArray(contractLineItems.periodId, periodIds)),
      ])
    : [[], []];

  const clientRecords = allClients.map(c => {
    const periodIdsForClient = new Set([
      ...allPeriodClients.filter(pc => pc.clientId === c.id).map(pc => pc.periodId),
      ...allPeriods.filter(p => p.clientId === c.id).map(p => p.id),
    ]);
    return {
      id: c.id,
      name: c.name,
      socialLinks: c.socialLinks as Record<string, { handle?: string; url?: string }> | null,
      periods: allPeriods.filter(p => periodIdsForClient.has(p.id)).map(p => ({
        ...p,
        months: allMonths.filter(m => m.periodId === p.id),
        lineItems: allLineItems.filter(li => li.periodId === p.id),
        clientIds: allPeriodClients.filter(pc => pc.periodId === p.id).map(pc => pc.clientId),
      })),
    };
  });

  const { rows, totals, firstPass, error } = roster;

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
          unclassified={totals.unclassified}
          unclassifiedStatuses={totals.unclassifiedStatuses}
          firstPass={firstPass}
        />
        <ClientsPageClient
          rows={rows}
          clientRecords={clientRecords}
          openClientId={client || null}
          error={error}
          showHeader={false}
        />
      </div>
    </main>
  );
}
