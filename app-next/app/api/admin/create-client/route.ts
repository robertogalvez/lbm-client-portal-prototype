import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
    await db
      .update(authUsers)
      .set({ role: 'client', clientName, name })
      .where(eq(authUsers.email, email));
    await sendInviteEmail(email);
    return NextResponse.json({ ok: true, action: 'updated', email });
  }

  // Create new user
  const id = crypto.randomUUID();
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

  await sendInviteEmail(email);
  return NextResponse.json({ ok: true, action: 'created', id, email });
}

async function sendInviteEmail(email: string) {
  try {
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/client' }),
    });
    if (!res.ok) console.error('[create-client] magic link error:', await res.text());
    else console.log('[create-client] invite sent to', email);
  } catch (e) {
    console.error('[create-client] magic link exception:', e);
  }
}
