import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { contractPeriods, contractPeriodClients, contractLineItems } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireAdmin } from '@/lib/require-admin';

type LineItemInput = { deliverableType: string; contractedTotal: number; monthlyQuota: number | null; carriedIn: number | null };

function aggregateFromLineItems(items: LineItemInput[]): { contractedTotal: number; monthlyQuota: number | null } {
  const contractedTotal = items.reduce((sum, i) => sum + i.contractedTotal, 0);
  const withQuota = items.filter(i => i.monthlyQuota != null);
  const monthlyQuota = withQuota.length > 0 ? withQuota.reduce((sum, i) => sum + (i.monthlyQuota ?? 0), 0) : null;
  return { contractedTotal, monthlyQuota };
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const body = await req.json();
  const {
    clientIds, label, startsOn, endsOn, model, cadencePerWeek, monthlyQuota, contractedTotal, state, carriedIn, notes,
    lineItems, renewedFromPeriodId, dataQualityFlag, cycleDurationDays,
  }: {
    clientIds: string[]; label: string; startsOn: string; endsOn?: string | null; model: string;
    cadencePerWeek?: number | null; monthlyQuota?: number | null; contractedTotal?: number; state: string;
    carriedIn?: number | null; notes?: string | null; lineItems?: LineItemInput[];
    renewedFromPeriodId?: string | null; dataQualityFlag?: string | null; cycleDurationDays?: number | null;
  } = body;

  if (!Array.isArray(clientIds) || clientIds.length === 0 || !label || !startsOn || !model || !state) {
    return NextResponse.json({ error: 'clientIds (at least one), label, startsOn, model, and state are required' }, { status: 400 });
  }
  const items = (lineItems ?? []).filter(i => i.deliverableType && i.contractedTotal != null);
  if ((lineItems ?? []).length > 0 && items.length !== (lineItems ?? []).length) {
    return NextResponse.json({ error: 'Every line item needs a deliverableType and contractedTotal' }, { status: 400 });
  }
  const agg = items.length > 0 ? aggregateFromLineItems(items) : { contractedTotal: contractedTotal ?? 0, monthlyQuota: monthlyQuota ?? null };
  if (!agg.contractedTotal) {
    return NextResponse.json({ error: 'contractedTotal is required (directly, or via at least one line item)' }, { status: 400 });
  }

  const [updated] = await db.update(contractPeriods).set({
    clientId: clientIds[0],
    label,
    startsOn,
    endsOn: endsOn || null,
    model,
    cadencePerWeek: cadencePerWeek ?? null,
    monthlyQuota: agg.monthlyQuota,
    contractedTotal: agg.contractedTotal,
    state,
    carriedIn: carriedIn ?? 0,
    notes: notes || null,
    renewedFromPeriodId: renewedFromPeriodId || null,
    dataQualityFlag: dataQualityFlag || null,
    cycleDurationDays: cycleDurationDays ?? null,
  }).where(eq(contractPeriods.id, id)).returning();

  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Replace-all semantics for both child tables — simpler and less error
  // prone than diffing, and cheap at this scale (a handful of rows per period).
  await db.delete(contractPeriodClients).where(eq(contractPeriodClients.periodId, id));
  for (const clientId of clientIds) {
    await db.insert(contractPeriodClients).values({ periodId: id, clientId });
  }

  await db.delete(contractLineItems).where(eq(contractLineItems.periodId, id));
  for (const item of items) {
    await db.insert(contractLineItems).values({
      periodId: id,
      deliverableType: item.deliverableType,
      contractedTotal: item.contractedTotal,
      monthlyQuota: item.monthlyQuota ?? null,
      carriedIn: item.carriedIn ?? 0,
    });
  }

  return NextResponse.json({ ok: true, period: updated, clientIds, lineItems: items });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  // contract_months, contract_period_clients, and contract_line_items rows
  // for this period all cascade via their FK's ON DELETE CASCADE.
  const [deleted] = await db.delete(contractPeriods).where(eq(contractPeriods.id, id)).returning({ id: contractPeriods.id });
  if (!deleted) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
