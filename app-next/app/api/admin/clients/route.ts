import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractPeriodClients, contractLineItems, contractMonths } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { requireAdmin } from '@/lib/require-admin';

export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  // Independent of each other, so one round-trip of wall time instead of several.
  // portalUsers is the linked-portal-user count per client, matched by name.
  const [allClients, portalUsers, allPeriodClients, allPeriods] = await Promise.all([
    db.select().from(clients).orderBy(clients.createdAt),
    db
      .select({ clientName: authUsers.clientName, email: authUsers.email, name: authUsers.name, id: authUsers.id, emailVerified: authUsers.emailVerified })
      .from(authUsers)
      .where(eq(authUsers.role, 'client')),
    db.select().from(contractPeriodClients),
    db.select().from(contractPeriods),
  ]);

  const periodIds = allPeriods.map(p => p.id);
  const [allMonths, allLineItems] = periodIds.length > 0
    ? await Promise.all([
        db.select().from(contractMonths).where(inArray(contractMonths.periodId, periodIds)),
        db.select().from(contractLineItems).where(inArray(contractLineItems.periodId, periodIds)),
      ])
    : [[], []];

  const result = allClients.map(c => {
    // A period belongs to this client if the new join table says so, falling
    // back to the old direct clientId column for any period PR 1's backfill
    // hasn't reached yet (shouldn't happen post-backfill, but never silently
    // drop a period rather than assume the backfill definitely ran).
    const periodIdsForClient = new Set([
      ...allPeriodClients.filter(pc => pc.clientId === c.id).map(pc => pc.periodId),
      ...allPeriods.filter(p => p.clientId === c.id).map(p => p.id),
    ]);
    const periods = allPeriods
      .filter(p => periodIdsForClient.has(p.id))
      .map(p => ({
        ...p,
        months: allMonths.filter(m => m.periodId === p.id),
        lineItems: allLineItems.filter(li => li.periodId === p.id),
        clientIds: allPeriodClients.filter(pc => pc.periodId === p.id).map(pc => pc.clientId),
      }));
    return {
      ...c,
      portalUsers: portalUsers.filter(u => u.clientName === c.name),
      periods,
    };
  });

  return NextResponse.json(result);
}

// Clients are no longer hand-created here — they originate from the ClickUp
// Master Clients List via /api/admin/clients/sync (and the scheduled sync).
