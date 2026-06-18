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

  const { userId, role, deactivate } = await req.json() as {
    userId?: string;
    role?: string;
    deactivate?: boolean;
  };

  if (!userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 });

  // Prevent self-modification
  if (userId === session.user.id) {
    return NextResponse.json({ error: 'Cannot modify your own account' }, { status: 400 });
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

  if (role) {
    const validRole = role === 'admin' ? 'admin' : 'account_manager';
    await db
      .update(authUsers)
      .set({ role: validRole, updatedAt: new Date() })
      .where(eq(authUsers.id, userId));
    return NextResponse.json({ ok: true, action: 'updated', role: validRole });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}
