import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractMonths } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getClientQuotas } from '@/lib/clickup';
import { ClientsPageClient } from './ClientsPageClient';

export const revalidate = 60;

export default async function AdminClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  // Independent of each other, so one round-trip of wall time instead of three.
  // The role check above stays sequential — it gates whether we query at all.
  const [allClients, quotas, portalUsers, allPeriods, allMonths] = await Promise.all([
    db.select().from(clients).orderBy(clients.createdAt),
    getClientQuotas(),
    db
      .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, clientName: authUsers.clientName, emailVerified: authUsers.emailVerified })
      .from(authUsers)
      .where(eq(authUsers.role, 'client')),
    db.select().from(contractPeriods),
    db.select().from(contractMonths),
  ]);

  const clientsWithUsers = allClients.map(c => {
    const quota = quotas.find(q => q.name === c.name);
    const periods = allPeriods
      .filter(p => p.clientId === c.id)
      .map(p => ({ ...p, months: allMonths.filter(m => m.periodId === p.id) }));
    return {
      ...c,
      brandingConfig: c.brandingConfig as Record<string, unknown> | null,
      socialLinks: c.socialLinks as Record<string, { handle?: string; url?: string }> | null,
      monthlyReels: quota?.reelsPerMonth ?? 0,
      monthlyYoutube: quota?.ytPerMonth ?? 0,
      portalUsers: portalUsers.filter(u => u.clientName === c.name),
      periods,
    };
  });

  return <ClientsPageClient clients={clientsWithUsers} />;
}
