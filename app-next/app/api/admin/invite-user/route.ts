import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { name, email, role } = await req.json() as { name?: string; email?: string; role?: string };
  if (!name || !email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 });
  }

  const validRole = role === 'admin' ? 'admin' : 'account_manager';

  const existing = await db
    .select({ id: authUsers.id })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);

  let userId: string;
  let action: string;

  if (existing.length > 0) {
    await db
      .update(authUsers)
      .set({ name, role: validRole, updatedAt: new Date() })
      .where(eq(authUsers.email, email));
    userId = existing[0].id;
    action = 'updated';
  } else {
    userId = crypto.randomUUID();
    await db.insert(authUsers).values({
      id: userId,
      email,
      name,
      emailVerified: false,
      role: validRole,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    action = 'created';
  }

  // Send magic link via BetterAuth's sign-in endpoint
  try {
    const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:3000';
    await fetch(`${baseUrl}/api/auth/sign-in/magic-link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, callbackURL: '/dashboard' }),
    });
  } catch (e) {
    console.error('[invite-user] magic link error:', e);
    // Don't fail the request — user was created, link is best-effort
  }

  return NextResponse.json({ ok: true, action, userId, email });
}
