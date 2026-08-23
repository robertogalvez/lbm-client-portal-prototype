import { NextResponse } from 'next/server';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients as clientsTable, contractPeriods, contractMonths, contractPeriodClients, contractLineItems } from '@/lib/db/schema';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { fulfilment, beyondContract, healthTier, onCadence } from '@/lib/contracts';
import type { ClientDetailData, LedgerRow, ContractHistoryRow } from '@/components/dashboard/ClientDetail';
import type { ContractPeriodRecord } from '@/components/shared/ClientEditPanel';

const EDITING_STATUSES = new Set(['qc final - am', 'tc - qc (somu)', 'in progress (corrections)', 'in progress (editor)']);
function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function parseDate(s: string) {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const [period] = await db
    .select({
      id: contractPeriods.id,
      clientId: contractPeriods.clientId,
      clientName: clientsTable.name,
      socialLinks: clientsTable.socialLinks,
      label: contractPeriods.label,
      startsOn: contractPeriods.startsOn,
      endsOn: contractPeriods.endsOn,
      model: contractPeriods.model,
      cadencePerWeek: contractPeriods.cadencePerWeek,
      monthlyQuota: contractPeriods.monthlyQuota,
      contractedTotal: contractPeriods.contractedTotal,
      state: contractPeriods.state,
      carriedIn: contractPeriods.carriedIn,
      notes: contractPeriods.notes,
    })
    .from(contractPeriods)
    .innerJoin(clientsTable, eq(contractPeriods.clientId, clientsTable.id))
    .where(eq(contractPeriods.id, id));

  if (!period) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const allPeriods = await db
    .select()
    .from(contractPeriods)
    .where(eq(contractPeriods.clientId, period.clientId))
    .orderBy(contractPeriods.startsOn);

  const periodIds = allPeriods.map(p => p.id);
  const [allMonths, allLineItems, allPeriodClients] = periodIds.length > 0
    ? await Promise.all([
        db.select().from(contractMonths).where(inArray(contractMonths.periodId, periodIds)),
        db.select().from(contractLineItems).where(inArray(contractLineItems.periodId, periodIds)),
        db.select().from(contractPeriodClients).where(inArray(contractPeriodClients.periodId, periodIds)),
      ])
    : [[], [], []];

  const { tasks: allTasks } = await getDashboardTasks();
  const clientTasks = allTasks.filter(t => norm(t.clientName ?? '') === norm(period.clientName));

  const periodStartMs = new Date(period.startsOn).getTime();
  const published = clientTasks.filter(t => norm(t.status) === 'posted in socials' && parseDate(t.dateUpdated) >= periodStartMs).length;
  const pendingReview = clientTasks.filter(t => norm(t.status) === 'for client review').length;
  const editing = clientTasks.filter(t => EDITING_STATUSES.has(norm(t.status))).length;
  const onHold = 0; // see ClientDetail.tsx / DashboardTabs — no live "on hold" ClickUp status exists

  const fulfilmentFrac = fulfilment(published, period.contractedTotal);
  const beyond = beyondContract(published, period.contractedTotal);
  const health = healthTier({ contractState: period.state, fulfilment: fulfilmentFrac });

  const deliverableCounts = new Map<string, number>();
  for (const t of clientTasks) {
    if (norm(t.status) !== 'posted in socials' || parseDate(t.dateUpdated) < periodStartMs) continue;
    deliverableCounts.set(t.deliverableType, (deliverableCounts.get(t.deliverableType) ?? 0) + 1);
  }
  const deliverableMix = Array.from(deliverableCounts.entries()).map(([type, delivered]) => ({ type: type as 'short_form' | 'youtube' | 'ad', delivered }));

  const ledger: LedgerRow[] = clientTasks
    .map(t => ({ id: t.clickupTaskId, title: t.clientFacingTitle ?? t.title, status: t.status, dateUpdated: t.dateUpdated, frameLink: t.frameLink, instagramUrl: t.instagramUrl }))
    .sort((a, b) => parseDate(b.dateUpdated) - parseDate(a.dateUpdated));

  const contractHistory: ContractHistoryRow[] = allPeriods.map(p => {
    const start = new Date(p.startsOn).getTime();
    const end = p.endsOn ? new Date(p.endsOn).getTime() : Date.now();
    const periodPosted = clientTasks.filter(t => norm(t.status) === 'posted in socials' && parseDate(t.dateUpdated) >= start && parseDate(t.dateUpdated) <= end);
    const delivered = periodPosted.length;
    const cadence = onCadence(periodPosted.map(t => new Date(parseDate(t.dateUpdated))), p.cadencePerWeek, new Date(p.startsOn), p.endsOn ? new Date(p.endsOn) : new Date());
    return {
      id: p.id,
      label: p.label,
      state: p.state,
      startsOn: p.startsOn,
      endsOn: p.endsOn,
      contractedTotal: p.contractedTotal,
      delivered,
      fulfilmentPct: (() => { const f = fulfilment(delivered, p.contractedTotal); return f !== null ? f * 100 : null; })(),
      cadenceText: cadence ? `${cadence.actualPerWeek.toFixed(1)}/wk vs ${cadence.expectedPerWeek}/wk contracted` : null,
    };
  });

  const periods: ContractPeriodRecord[] = allPeriods.map(p => ({
    ...p,
    months: allMonths.filter(m => m.periodId === p.id),
    lineItems: allLineItems.filter(li => li.periodId === p.id),
    clientIds: allPeriodClients.filter(pc => pc.periodId === p.id).map(pc => pc.clientId),
  }));

  const data: ClientDetailData = {
    clientId: period.clientId,
    name: period.clientName,
    type: period.model === 'package' ? 'package' : 'retainer',
    health,
    contracted: period.contractedTotal,
    published,
    pendingReview,
    editing,
    onHold,
    beyond,
    fulfilmentPct: fulfilmentFrac !== null ? fulfilmentFrac * 100 : null,
    currentPeriod: {
      label: period.label,
      model: period.model,
      cadencePerWeek: period.cadencePerWeek,
      monthlyQuota: period.monthlyQuota,
      contractedTotal: period.contractedTotal,
      carriedIn: period.carriedIn ?? 0,
      notes: period.notes,
      startsOn: period.startsOn,
      endsOn: period.endsOn,
      state: period.state,
    },
    deliverableMix,
    ledger,
    contractHistory,
    socialLinks: period.socialLinks as Record<string, { handle?: string; url?: string }> | null,
    periods,
  };

  return NextResponse.json(data);
}
