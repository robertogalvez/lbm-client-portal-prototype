import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Shared session+role check repeated verbatim across every admin/contracts
// and admin/clients route. Returns the caller's session on success, or a
// ready-to-return NextResponse (401/403) on failure — callers do
// `const gate = await requireAdmin(); if (gate instanceof NextResponse) return gate;`
export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return { userId: session.user.id };
}
