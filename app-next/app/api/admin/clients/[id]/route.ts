import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  // Name, contact info, status, and quota are ClickUp-owned (synced from the
  // Master Clients List) — only portal-only fields are editable here.
  const { type, frameioProjectId, vistaSocialProfileIds, showCalendar, showInvoices } = body;

  const [updated] = await db.update(clients).set({
    type: type || null,
    frameioProjectId: frameioProjectId || null,
    brandingConfig: vistaSocialProfileIds ? { vistaSocialProfileIds } : null,
    showCalendar: showCalendar ?? false,
    showInvoices: showInvoices ?? false,
  }).where(eq(clients.id, id)).returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, client: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [target] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const linked = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.clientName, target.name)).limit(1);
  if (linked.length > 0) return NextResponse.json({ error: 'Cannot delete — client has linked portal users' }, { status: 409 });

  // Note: if the corresponding task is still Active/Inactive in the Master Clients
  // List, the next sync run will recreate this row.
  await db.delete(clients).where(eq(clients.id, id));
  return NextResponse.json({ ok: true });
}
