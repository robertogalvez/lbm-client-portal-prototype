import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const allClients = await db.select().from(clients).orderBy(clients.createdAt);

  // Count linked portal users per client (matched by name)
  const portalUsers = await db
    .select({ clientName: authUsers.clientName, email: authUsers.email, name: authUsers.name, id: authUsers.id, emailVerified: authUsers.emailVerified })
    .from(authUsers)
    .where(eq(authUsers.role, 'client'));

  const result = allClients.map(c => ({
    ...c,
    portalUsers: portalUsers.filter(u => u.clientName === c.name),
  }));

  return NextResponse.json(result);
}

// Clients are no longer hand-created here — they originate from the ClickUp
// Master Clients List via /api/admin/clients/sync (and the scheduled sync).
