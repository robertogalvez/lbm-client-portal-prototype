import { NextResponse } from 'next/server';

export async function GET() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 });

  try {
    const { Resend } = await import('resend');
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: 'LBM Portal <onboarding@resend.dev>',
      to:   'robertogalvezb@gmail.com',
      subject: 'LBM Portal — Resend test',
      html: '<p>If you see this, Resend is working correctly.</p>',
    });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
