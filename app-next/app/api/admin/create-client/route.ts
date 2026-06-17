import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only admins/account managers can create client accounts
  const callerRows = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const callerRole = callerRows[0]?.role ?? '';
  if (callerRole === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { email, name, clientName } = await req.json() as { email?: string; name?: string; clientName?: string };
  if (!email || !name || !clientName) {
    return NextResponse.json({ error: 'email, name, and clientName are required' }, { status: 400 });
  }

  // Check if user already exists
  const existing = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);

  if (existing.length > 0) {
    // Update existing user to client role and set clientName
    await db
      .update(authUsers)
      .set({ role: 'client', clientName, name })
      .where(eq(authUsers.email, email));
    return NextResponse.json({ ok: true, action: 'updated', email });
  }

  // Create new user
  const id = nanoid();
  await db.insert(authUsers).values({
    id,
    email,
    name,
    emailVerified: false,
    role: 'client',
    clientName,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true, action: 'created', id, email });
}
