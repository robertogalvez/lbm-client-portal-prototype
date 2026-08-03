import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients, contractPeriods, contractMonths } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getClientQuotas } from '@/lib/clickup';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Independent of each other, so one round-trip of wall time instead of three.
  // portalUsers is the linked-portal-user count per client, matched by name.
  const [allClients, quotas, portalUsers, allPeriods, allMonths] = await Promise.all([
    db.select().from(clients).orderBy(clients.createdAt),
    getClientQuotas(),
    db
      .select({ clientName: authUsers.clientName, email: authUsers.email, name: authUsers.name, id: authUsers.id, emailVerified: authUsers.emailVerified })
      .from(authUsers)
      .where(eq(authUsers.role, 'client')),
    db.select().from(contractPeriods),
    db.select().from(contractMonths),
  ]);

  const result = allClients.map(c => {
    const quota = quotas.find(q => q.name === c.name);
    const periods = allPeriods
      .filter(p => p.clientId === c.id)
      .map(p => ({ ...p, months: allMonths.filter(m => m.periodId === p.id) }));
    return {
      ...c,
      monthlyReels: quota?.reelsPerMonth ?? 0,
      monthlyYoutube: quota?.ytPerMonth ?? 0,
      portalUsers: portalUsers.filter(u => u.clientName === c.name),
      periods,
    };
  });

  return NextResponse.json(result);
}

// Clients are no longer hand-created here — they originate from the ClickUp
// Master Clients List via /api/admin/clients/sync (and the scheduled sync).
