import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { CreateClientForm } from './CreateClientForm';

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

  return (
    <div style={{ padding: '32px 24px', maxWidth: 560 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111c28', margin: '0 0 4px' }}>
        Client Accounts
      </h1>
      <p style={{ fontSize: 14, color: '#54616f', margin: '0 0 28px' }}>
        Create or update a portal account for a client. They'll log in via magic link.
      </p>

      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, padding: '24px' }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#111c28', margin: '0 0 20px' }}>
          Add / update client
        </h2>
        <CreateClientForm />
      </div>
    </div>
  );
}
