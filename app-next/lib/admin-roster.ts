// The one server-side load behind every admin screen.
//
// The Dashboard and the Clients page used to load overlapping-but-different
// slices of the same data and then compute their own numbers on top. They now
// call this, so "in flight" on the dashboard and "in flight" on Clients are
// literally the same value.

import { db } from '@/lib/db';
import { clients as clientsTable, authUsers, contractPeriods, contractPeriodClients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { resolveCurrentPeriod } from '@/lib/contracts';
import type { ContractJoinRow, ClientPortfolioInput } from '@/lib/portfolio';
import { buildAdminRows, buildAdminTotals, type AdminClientRow, type AdminTotals } from '@/lib/admin-views';
import { norm } from '@/lib/pipeline';

export interface AdminRoster {
  rows: AdminClientRow[];
  totals: AdminTotals;
  /** Clients hidden because ClickUp marks them Inactive — surfaced as "N inactive hidden". */
  inactiveCount: number;
  error?: string | null;
}

export async function loadAdminRoster(opts: { includeInactive?: boolean } = {}): Promise<AdminRoster> {
  const [allClients, portalUsers, allPeriodClients, allPeriods, taskResult] = await Promise.all([
    db.select().from(clientsTable).orderBy(clientsTable.createdAt),
    db.select({ clientName: authUsers.clientName }).from(authUsers).where(eq(authUsers.role, 'client')),
    db.select().from(contractPeriodClients),
    db.select().from(contractPeriods),
    getDashboardTasks(),
  ]);

  const inactive = allClients.filter(c => c.clientStatus === 'Inactive');
  const visibleClients = opts.includeInactive ? allClients : allClients.filter(c => c.clientStatus !== 'Inactive');
  const inactiveNames = new Set(inactive.map(c => norm(c.name)));

  let allTasks = taskResult.tasks;
  if (!opts.includeInactive && inactiveNames.size > 0) {
    allTasks = allTasks.filter(t => !t.clientName || !inactiveNames.has(norm(t.clientName)));
  }

  const now = new Date();
  const inputs: ClientPortfolioInput[] = visibleClients.map(c => {
    // A period belongs to this client if the join table says so, falling back
    // to the legacy direct clientId column for any period the backfill missed.
    const periodIdsForClient = new Set([
      ...allPeriodClients.filter(pc => pc.clientId === c.id).map(pc => pc.periodId),
      ...allPeriods.filter(p => p.clientId === c.id).map(p => p.id),
    ]);
    const current = resolveCurrentPeriod(allPeriods.filter(p => periodIdsForClient.has(p.id)), now);
    const period: ContractJoinRow | null = current ? {
      id: current.id,
      clientName: c.name,
      clickupClientOptionId: c.clickupClientOptionId,
      label: current.label,
      startsOn: current.startsOn,
      endsOn: current.endsOn,
      model: current.model,
      contractedTotal: current.contractedTotal,
      state: current.state,
    } : null;
    return {
      clientId: c.id,
      clientName: c.name,
      billing: c.type as 'retainer' | 'one_time' | null,
      portalUserCount: portalUsers.filter(u => u.clientName === c.name).length,
      period,
    };
  });

  const rows = buildAdminRows(inputs, allTasks, now);
  return { rows, totals: buildAdminTotals(rows), inactiveCount: inactive.length, error: taskResult.error };
}
