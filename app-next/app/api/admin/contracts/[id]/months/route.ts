import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contractMonths, contractLineItems } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requireAdmin } from '@/lib/require-admin';

// `id` here is the contract_periods id this month deviation belongs to.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json();
  const { month, active, quotaOverride, scopeNote, amended, note, lineItemId } = body;

  if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });

  if (lineItemId) {
    const [item] = await db.select({ id: contractLineItems.id }).from(contractLineItems)
      .where(and(eq(contractLineItems.id, lineItemId), eq(contractLineItems.periodId, id))).limit(1);
    if (!item) return NextResponse.json({ error: 'lineItemId does not belong to this period' }, { status: 400 });
  }

  try {
    const [created] = await db.insert(contractMonths).values({
      periodId: id,
      lineItemId: lineItemId || null,
      month,
      active: active ?? true,
      quotaOverride: quotaOverride ?? null,
      scopeNote: scopeNote || null,
      amended: amended ?? false,
      note: note || null,
    }).returning();
    return NextResponse.json({ ok: true, month: created });
  } catch (e) {
    // Unique (period_id, line_item_id, month) constraint — this month already
    // has a deviation row (aggregate or for this same line item).
    return NextResponse.json({ error: String(e) }, { status: 409 });
  }
}
