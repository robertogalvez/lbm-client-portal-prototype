import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ClientsPageClient } from './ClientsPageClient';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  const allClients = await db.select().from(clients).orderBy(clients.createdAt);

  const portalUsers = await db
    .select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, clientName: authUsers.clientName, emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.role, 'client'));

  const clientsWithUsers = allClients.map(c => ({
    ...c,
    portalUsers: portalUsers.filter(u => u.clientName === c.name),
  }));

  return <ClientsPageClient clients={clientsWithUsers} />;
}
