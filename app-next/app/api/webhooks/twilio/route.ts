import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

function twilioSignatureValid(
  authToken: string,
  url: string,
  params: Record<string, string>,
  sig: string,
): boolean {
  const sorted = Object.keys(params).sort();
  const input = url + sorted.map(k => k + params[k]).join('');
  const expected = createHmac('sha1', authToken).update(input, 'utf8').digest('base64');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  } catch {
    return false;
  }
}

const TWIML_EMPTY = '<Response/>';

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    console.error('[twilio-webhook] TWILIO_AUTH_TOKEN not configured');
    return new NextResponse('Server misconfigured', { status: 500 });
  }

  const sig = req.headers.get('x-twilio-signature') ?? '';
  const url = (process.env.APP_URL ?? '').replace(/\/$/, '') + '/api/webhooks/twilio';

  const text = await req.text();
  const formData = new URLSearchParams(text);
  const params: Record<string, string> = {};
  for (const [k, v] of formData.entries()) params[k] = v;

  if (!twilioSignatureValid(authToken, url, params, sig)) {
    console.warn('[twilio-webhook] Invalid signature');
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Twilio sends From in E.164 (+12048904483); normalize by stripping spaces
  // so it matches numbers stored with spaces (+1 204 890 4483).
  const from = (params['From'] ?? '').replace(/\s/g, '');
  const body = (params['Body'] ?? '').trim().toUpperCase();

  console.log('[twilio-webhook] from:', from, 'body:', body);

  if (!from) {
    return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } });
  }

  // Match on phone with spaces stripped on both sides
  const allUsers = await db
    .select({ id: authUsers.id, phone: authUsers.phone })
    .from(authUsers)
    .where(eq(authUsers.role, 'client'));
  const user = allUsers.find(u => (u.phone ?? '').replace(/\s/g, '') === from);

  console.log('[twilio-webhook] matched user:', user?.id ?? 'none');

  if (user) {
    if (body === 'YES' || body === 'Y') {
      await db.update(authUsers)
        .set({ smsConsentStatus: 'opted_in' })
        .where(eq(authUsers.id, user.id));
    } else if (body.startsWith('STOP')) {
      await db.update(authUsers)
        .set({ smsConsentStatus: 'opted_out', notifySms: false })
        .where(eq(authUsers.id, user.id));
    }
  }

  return new NextResponse(TWIML_EMPTY, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
