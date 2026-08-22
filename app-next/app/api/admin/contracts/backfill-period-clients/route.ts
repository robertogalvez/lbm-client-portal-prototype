import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, contractPeriods, contractPeriodClients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// One-time backfill for the contract redesign: contract_period_clients used
// to not exist, so every existing contractPeriods row only ever pointed at
// one client via its own clientId column. This copies that into the new
// join table (1 row per existing period) so reads can move over to it
// without losing any existing period↔client link. Safe to run more than
// once — onConflictDoNothing skips periods already backfilled.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const periods = await db.select({ id: contractPeriods.id, clientId: contractPeriods.clientId }).from(contractPeriods);

  let inserted = 0;
  for (const period of periods) {
    const rows = await db
      .insert(contractPeriodClients)
      .values({ periodId: period.id, clientId: period.clientId })
      .onConflictDoNothing({ target: [contractPeriodClients.periodId, contractPeriodClients.clientId] })
      .returning({ id: contractPeriodClients.id });
    if (rows.length > 0) inserted++;
  }

  return NextResponse.json({ ok: true, periodsSeen: periods.length, inserted });
}
