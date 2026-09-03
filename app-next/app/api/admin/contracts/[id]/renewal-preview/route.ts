import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients as clientsTable, contractPeriods, contractPeriodClients, contractLineItems } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { computeCarriedIn } from '@/lib/contracts';
import { requireAdmin } from '@/lib/require-admin';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function parseDate(s: string) {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}

// Read-only: given a period id, suggests the numbers a "Renew this contract"
// action should pre-fill — carriedIn (aggregate + per line item, via
// computeCarriedIn) and a startsOn one day after this period's endsOn. The
// admin reviews/edits these before actually creating the renewal.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [period] = await db.select().from(contractPeriods).where(eq(contractPeriods.id, id)).limit(1);
  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const periodClients = await db.select({ clientId: contractPeriodClients.clientId })
    .from(contractPeriodClients).where(eq(contractPeriodClients.periodId, id));
  const clientIds = periodClients.length > 0 ? periodClients.map(c => c.clientId) : [period.clientId];
  const clientRows = await db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable).where(inArray(clientsTable.id, clientIds));
  const clientNames = new Set(clientRows.map(c => norm(c.name)));

  const lineItems = await db.select().from(contractLineItems).where(eq(contractLineItems.periodId, id));

  const { tasks: allTasks } = await getDashboardTasks();
  const periodStartMs = new Date(period.startsOn).getTime();
  const periodEndMs = period.endsOn ? new Date(period.endsOn).getTime() : Date.now();
  const delivered = allTasks.filter(t =>
    clientNames.has(norm(t.clientName ?? '')) &&
    norm(t.status) === 'posted in socials' &&
    parseDate(t.dateUpdated) >= periodStartMs && parseDate(t.dateUpdated) <= periodEndMs,
  );

  const deliveredByType: Record<string, number> = {};
  for (const t of delivered) deliveredByType[t.deliverableType] = (deliveredByType[t.deliverableType] ?? 0) + 1;

  const aggregateCarriedIn = computeCarriedIn(period.contractedTotal, delivered.length);
  const carriedInByType: Record<string, number> = {};
  for (const li of lineItems) {
    carriedInByType[li.deliverableType] = computeCarriedIn(li.contractedTotal, deliveredByType[li.deliverableType] ?? 0);
  }

  const suggestedStartsOn = period.endsOn
    ? new Date(new Date(period.endsOn).getTime() + 86_400_000).toISOString().slice(0, 10)
    : null;

  return NextResponse.json({
    ok: true,
    clientIds,
    suggestedStartsOn,
    cycleDurationDays: period.cycleDurationDays,
    carriedIn: aggregateCarriedIn,
    lineItems: lineItems.map(li => ({
      deliverableType: li.deliverableType,
      contractedTotal: li.contractedTotal,
      monthlyQuota: li.monthlyQuota,
      suggestedCarriedIn: carriedInByType[li.deliverableType] ?? 0,
    })),
  });
}
