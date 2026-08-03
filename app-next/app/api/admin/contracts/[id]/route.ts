import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, contractPeriods } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { label, startsOn, endsOn, model, cadencePerWeek, monthlyQuota, contractedTotal, state, carriedIn, notes } = body;

  if (!label || !startsOn || !model || !contractedTotal || !state) {
    return NextResponse.json({ error: 'label, startsOn, model, contractedTotal, and state are required' }, { status: 400 });
  }

  const [updated] = await db.update(contractPeriods).set({
    label,
    startsOn,
    endsOn: endsOn || null,
    model,
    cadencePerWeek: cadencePerWeek ?? null,
    monthlyQuota: monthlyQuota ?? null,
    contractedTotal,
    state,
    carriedIn: carriedIn ?? 0,
    notes: notes || null,
  }).where(eq(contractPeriods.id, id)).returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, period: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // contract_months rows for this period cascade via the FK's ON DELETE CASCADE.
  const [deleted] = await db.delete(contractPeriods).where(eq(contractPeriods.id, id)).returning({ id: contractPeriods.id });
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
