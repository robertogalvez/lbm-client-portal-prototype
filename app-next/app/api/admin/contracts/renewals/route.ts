import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients as clientsTable, contractPeriods, contractPeriodClients } from '@/lib/db/schema';
import { eq, inArray, isNotNull, and } from 'drizzle-orm';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { resolveCycleAnchor } from '@/lib/contracts';
import { requireAdmin } from '@/lib/require-admin';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

// The AM's "which contracts do I need to renew" control panel (Amendment
// B) — every active/extended period in rolling-cycle mode
// (cycleDurationDays set), with its anchor resolved (and persisted, the
// first time it's found — see resolveCycleAnchor's "set once" contract)
// and its computed end date, sorted soonest-to-expire first.
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const periods = await db.select().from(contractPeriods)
    .where(and(isNotNull(contractPeriods.cycleDurationDays), inArray(contractPeriods.state, ['active', 'extended'])));

  if (periods.length === 0) return NextResponse.json({ periods: [] });

  const periodIds = periods.map(p => p.id);
  const [periodClients, allClients, { tasks: allTasks }] = await Promise.all([
    db.select().from(contractPeriodClients).where(inArray(contractPeriodClients.periodId, periodIds)),
    db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable),
    getDashboardTasks(),
  ]);
  const clientNameById = new Map(allClients.map(c => [c.id, c.name]));

  const result = [];
  for (const p of periods) {
    const linkedClientIds = periodClients.filter(pc => pc.periodId === p.id).map(pc => pc.clientId);
    const clientIds = linkedClientIds.length > 0 ? linkedClientIds : [p.clientId];
    const names = clientIds.map(id => clientNameById.get(id)).filter((n): n is string => !!n);
    const nameSet = new Set(names.map(norm));

    let anchorDate = p.cycleAnchorDate;
    if (!anchorDate) {
      const clientVideos = allTasks
        .filter(t => nameSet.has(norm(t.clientName ?? '')))
        .map(t => ({ status: t.status, publishDate: t.publishDate, dueDate: t.dueDate }));
      const anchor = resolveCycleAnchor(clientVideos, new Date(p.startsOn));
      if (anchor) {
        anchorDate = anchor.toISOString().slice(0, 10);
        await db.update(contractPeriods).set({ cycleAnchorDate: anchorDate }).where(eq(contractPeriods.id, p.id));
      }
    }

    const cycleEndsOn = anchorDate
      ? new Date(new Date(anchorDate).getTime() + p.cycleDurationDays! * 86_400_000).toISOString().slice(0, 10)
      : null;
    const daysLeft = cycleEndsOn ? Math.ceil((new Date(cycleEndsOn).getTime() - Date.now()) / 86_400_000) : null;

    result.push({
      periodId: p.id, label: p.label, clientNames: names,
      cycleDurationDays: p.cycleDurationDays, cycleAnchorDate: anchorDate, cycleEndsOn, daysLeft,
    });
  }

  result.sort((a, b) => {
    if (a.daysLeft == null) return -1; // waiting-for-first-video rows first — nothing to count down yet
    if (b.daysLeft == null) return 1;
    return a.daysLeft - b.daysLeft;
  });

  return NextResponse.json({ periods: result });
}
