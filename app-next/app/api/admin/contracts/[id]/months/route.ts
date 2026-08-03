import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, contractMonths } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// `id` here is the contract_periods id this month deviation belongs to.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { month, active, quotaOverride, scopeNote, amended, note } = body;

  if (!month) return NextResponse.json({ error: 'month is required' }, { status: 400 });

  try {
    const [created] = await db.insert(contractMonths).values({
      periodId: id,
      month,
      active: active ?? true,
      quotaOverride: quotaOverride ?? null,
      scopeNote: scopeNote || null,
      amended: amended ?? false,
      note: note || null,
    }).returning();
    return NextResponse.json({ ok: true, month: created });
  } catch (e) {
    // Unique (period_id, month) constraint — this month already has a deviation row.
    return NextResponse.json({ error: String(e) }, { status: 409 });
  }
}
