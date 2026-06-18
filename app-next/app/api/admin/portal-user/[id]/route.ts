import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Prevent self-deletion
  if (id === session.user.id) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });

  const [target] = await db.select({ role: authUsers.role, emailVerified: authUsers.emailVerified }).from(authUsers).where(eq(authUsers.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only allow removing client portal users, not internal team members
  if (target.role !== 'client') return NextResponse.json({ error: 'Can only remove client portal users here' }, { status: 400 });

  await db.delete(authUsers).where(eq(authUsers.id, id));
  return NextResponse.json({ ok: true });
}
