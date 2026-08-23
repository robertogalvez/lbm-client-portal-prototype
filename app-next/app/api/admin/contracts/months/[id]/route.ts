import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contractMonths, contractLineItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/require-admin';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json();
  const { month, active, quotaOverride, scopeNote, amended, note, lineItemId } = body;
  if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });

  const [existing] = await db.select({ periodId: contractMonths.periodId }).from(contractMonths).where(eq(contractMonths.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (lineItemId) {
    const [item] = await db.select({ id: contractLineItems.id }).from(contractLineItems)
      .where(and(eq(contractLineItems.id, lineItemId), eq(contractLineItems.periodId, existing.periodId))).limit(1);
    if (!item) return NextResponse.json({ error: 'lineItemId does not belong to this period' }, { status: 400 });
  }

  const [updated] = await db.update(contractMonths).set({
    month,
    lineItemId: lineItemId || null,
    active: active ?? true,
    quotaOverride: quotaOverride ?? null,
    scopeNote: scopeNote || null,
    amended: amended ?? false,
    note: note || null,
  }).where(eq(contractMonths.id, id)).returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, month: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const [deleted] = await db.delete(contractMonths).where(eq(contractMonths.id, id)).returning({ id: contractMonths.id });
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
