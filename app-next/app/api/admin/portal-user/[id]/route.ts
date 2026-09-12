import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendSmsConsent } from '@/lib/sms';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const { phone, notifySms } = body as { phone?: string; notifySms?: boolean };

  const [existing] = await db
    .select({ notifySms: authUsers.notifySms, phone: authUsers.phone })
    .from(authUsers)
    .where(eq(authUsers.id, id))
    .limit(1);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const nextPhone = phone !== undefined ? (phone.trim() || null) : existing.phone;
  const nextNotifySms = notifySms !== undefined ? notifySms : existing.notifySms;

  const enablingSms = !existing.notifySms && nextNotifySms;
  const disablingSms = existing.notifySms && !nextNotifySms;

  // undefined = leave column untouched; null = explicitly clear.
  let consentSentAt: Date | null | undefined = undefined;
  let consentStatus: string | null | undefined = undefined;

  let smsSent: boolean | undefined;
  if (enablingSms && nextPhone) {
    smsSent = await sendSmsConsent({ to: nextPhone });
    if (smsSent) {
      consentSentAt = new Date();
      consentStatus = 'pending';
    }
    // If false: leave consent fields untouched; notifySms still saves so admin can retry
  }
  if (disablingSms) {
    consentSentAt = null;
    consentStatus = null;
  }

  await db.update(authUsers).set({
    ...(phone !== undefined ? { phone: nextPhone } : {}),
    ...(notifySms !== undefined ? { notifySms: nextNotifySms } : {}),
    ...(consentSentAt !== undefined ? { smsConsentSentAt: consentSentAt } : {}),
    ...(consentStatus !== undefined ? { smsConsentStatus: consentStatus } : {}),
  }).where(eq(authUsers.id, id));

  return NextResponse.json({ ok: true, smsSent });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Prevent self-deletion
  if (id === session.user.id) return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 });

  const [target] = await db.select({ role: authUsers.role, emailVerified: authUsers.emailVerified }).from(authUsers).where(eq(authUsers.id, id)).limit(1);
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Only allow removing client portal users, not internal team members
  if (target.role !== 'client') return NextResponse.json({ error: 'Can only remove client portal users here' }, { status: 400 });

  await db.delete(authUsers).where(eq(authUsers.id, id));
  return NextResponse.json({ ok: true });
}
