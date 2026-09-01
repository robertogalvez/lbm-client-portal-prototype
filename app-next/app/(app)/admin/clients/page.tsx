import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractPeriodClients, contractLineItems, contractMonths } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { loadAdminRoster } from '@/lib/admin-roster';
import { ClientsPageClient } from './ClientsPageClient';

export const revalidate = 60;

/**
 * Screen 2 — the roster, one table answering both "which accounts are at
 * risk?" and "do we have enough videos in motion to honour what we sold?"
 * (used to be split across an Accounts tab and a Coverage tab that mostly
 * repeated each other — see ClientsTable.tsx). The six KPI cards this page
 * used to open with duplicated the filter chips underneath them and are gone.
 */
export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  const { client = '' } = await searchParams;

  // The roster numbers come from the same loader the dashboard reads, so the
  // two screens cannot report different totals. The records below are only
  // what the contract editor needs for a client that has no period yet.
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

  return (
    <ClientsPageClient
      rows={roster.rows}
      clientRecords={clientRecords}
      openClientId={client || null}
      error={roster.error}
    />
  );
}
