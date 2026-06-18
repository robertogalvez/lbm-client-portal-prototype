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

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { name, type, monthlyQuota, clickupOptionId, frameioProjectId, whatsappNumber, vistaSocialProfileIds, showCalendar } = body;

  if (!name || !type) return NextResponse.json({ error: 'name and type are required' }, { status: 400 });

  const [created] = await db.insert(clients).values({
    name,
    type,
    clickupOptionId: clickupOptionId || crypto.randomUUID(),
    monthlyQuota: monthlyQuota ? Number(monthlyQuota) : null,
    frameioProjectId: frameioProjectId || null,
    whatsappNumber: whatsappNumber || null,
    brandingConfig: vistaSocialProfileIds ? { vistaSocialProfileIds } : null,
    showCalendar: showCalendar ?? false,
  }).returning();

  return NextResponse.json({ ok: true, client: created });
}
