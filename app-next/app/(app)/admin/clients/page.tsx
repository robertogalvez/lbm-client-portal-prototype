import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractPeriodClients, contractLineItems, contractMonths } from '@/lib/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { resolveCurrentPeriod } from '@/lib/contracts';
import { buildBacklog, buildPortfolio, buildPortfolioKpis, type ContractJoinRow, type ClientPortfolioInput } from '@/lib/portfolio';
import { ClientsPageClient } from './ClientsPageClient';

export const revalidate = 60;

export default async function AdminClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  // Independent of each other, so one round-trip of wall time instead of several.
  // The role check above stays sequential — it gates whether we query at all.
  const [allClients, portalUsers, allPeriodClients, allPeriods, taskResult] = await Promise.all([
    db.select().from(clients).orderBy(clients.createdAt),
    db
      .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, clientName: authUsers.clientName, emailVerified: authUsers.emailVerified })
      .from(authUsers)
      .where(eq(authUsers.role, 'client')),
    db.select().from(contractPeriodClients),
    db.select().from(contractPeriods),
    getDashboardTasks(),
  ]);

  const periodIds = allPeriods.map(p => p.id);
  const [allMonths, allLineItems] = periodIds.length > 0
    ? await Promise.all([
        db.select().from(contractMonths).where(inArray(contractMonths.periodId, periodIds)),
        db.select().from(contractLineItems).where(inArray(contractLineItems.periodId, periodIds)),
      ])
    : [[], []];

  const clientsWithUsers = allClients.map(c => {
    // A period belongs to this client if the join table says so, falling
    // back to the old direct clientId column for any period PR 1's backfill
    // hasn't reached yet (shouldn't happen post-backfill).
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
      brandingConfig: c.brandingConfig as Record<string, unknown> | null,
      socialLinks: c.socialLinks as Record<string, { handle?: string; url?: string }> | null,
      portalUsers: portalUsers.filter(u => u.clientName === c.name),
      periods,
    };
  });

  // Portfolio view data (formerly /dashboard's "Clients" tab) — the ONE
  // canonical "current" period per client via resolveCurrentPeriod, which
  // treats 'extended' as current too (fixes the old state==='active'-only
  // filter that made renewed-but-still-running contracts invisible).
  // Reuses the exact allPeriods/allPeriodClients rows already loaded above.
  const now = new Date();
  const portfolioInputs: ClientPortfolioInput[] = allClients.map(c => {
    const periodIdsForClient = new Set([
      ...allPeriodClients.filter(pc => pc.clientId === c.id).map(pc => pc.periodId),
      ...allPeriods.filter(p => p.clientId === c.id).map(p => p.id),
    ]);
    const clientPeriods = allPeriods.filter(p => periodIdsForClient.has(p.id));
    const current = resolveCurrentPeriod(clientPeriods, now);
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

  const allTasks = taskResult.tasks;
  const portfolioRows = buildPortfolio(portfolioInputs, allTasks, now);
  const portfolioKpis = buildPortfolioKpis(portfolioRows, buildBacklog(allTasks));

  return <ClientsPageClient clients={clientsWithUsers} portfolioKpis={portfolioKpis} portfolioRows={portfolioRows} />;
}
