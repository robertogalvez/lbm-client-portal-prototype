import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { VIEW_AS_COOKIE, VIEW_AS_MAX_AGE } from '@/lib/view-as';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { clientId } = await req.json() as { clientId?: string };
  if (!clientId) return NextResponse.json({ error: 'clientId is required' }, { status: 400 });

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  console.log(`[view-as] ${session.user.email} started viewing portal as client "${client.name}" (${client.id})`);

  const res = NextResponse.json({ ok: true, clientName: client.name });
  res.cookies.set(VIEW_AS_COOKIE, client.id, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: VIEW_AS_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
