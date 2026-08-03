import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, contractPeriods } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { clientId, label, startsOn, endsOn, model, cadencePerWeek, monthlyQuota, contractedTotal, state, carriedIn, notes } = body;

  if (!clientId || !label || !startsOn || !model || !contractedTotal || !state) {
    return NextResponse.json({ error: 'clientId, label, startsOn, model, contractedTotal, and state are required' }, { status: 400 });
  }

  const [created] = await db.insert(contractPeriods).values({
    clientId,
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
  }).returning();

  return NextResponse.json({ ok: true, period: created });
}
