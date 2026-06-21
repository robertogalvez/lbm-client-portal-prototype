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

  const { userId, role, deactivate, isAlsoClient, clientName } = await req.json() as {
    userId?: string;
    role?: string;
    deactivate?: boolean;
    isAlsoClient?: boolean;
    clientName?: string;
  };

  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  const isSelf = userId === session.user.id;

  // Allow self-edits only for isAlsoClient/clientName — block role changes and deactivation on self
  if (isSelf && (deactivate || role)) {
    return NextResponse.json({ error: 'Cannot change your own role or deactivate yourself' }, { status: 400 });
  }

  // Prevent modifying client accounts via this endpoint
  const [target] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, userId))
    .limit(1);

  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'client') return NextResponse.json({ error: 'Use the clients endpoint for client accounts' }, { status: 400 });

  if (deactivate) {
    await db.delete(authUsers).where(eq(authUsers.id, userId));
    return NextResponse.json({ ok: true, action: 'deleted' });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (role) {
    updates.role = role === 'admin' ? 'admin' : 'account_manager';
  }
  if (isAlsoClient !== undefined) {
    updates.isAlsoClient = isAlsoClient;
  }
  if (clientName !== undefined) {
    updates.clientName = clientName || null;
  }

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  await db.update(authUsers).set(updates).where(eq(authUsers.id, userId));
  return NextResponse.json({ ok: true, action: 'updated', ...updates });
}
