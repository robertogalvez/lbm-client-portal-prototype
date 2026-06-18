import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { ClientsPageClient } from './ClientsPageClient';

export const dynamic = 'force-dynamic';

export default async function AdminClientsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const rows = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (rows[0]?.role === 'client') redirect('/client');

  const clients = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      clientName: authUsers.clientName,
      emailVerified: authUsers.emailVerified,
      createdAt: authUsers.createdAt,
    })
    .from(authUsers)
    .where(eq(authUsers.role, 'client'));

  return <ClientsPageClient clients={clients} />;
}
