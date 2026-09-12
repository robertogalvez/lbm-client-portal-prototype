import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
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

  const from = params['From'] ?? '';
  const body = (params['Body'] ?? '').trim().toUpperCase();

  if (!from) {
    return new NextResponse(TWIML_EMPTY, { headers: { 'Content-Type': 'text/xml' } });
  }

  const [client] = await db
    .select({ id: clients.id, notifySms: clients.notifySms })
    .from(clients)
    .where(eq(clients.whatsappNumber, from))
    .limit(1);

  if (client) {
    if (body === 'YES' || body === 'Y') {
      await db.update(clients)
        .set({ smsConsentStatus: 'opted_in' })
        .where(eq(clients.id, client.id));
    } else if (body.startsWith('STOP')) {
      await db.update(clients)
        .set({ smsConsentStatus: 'opted_out', notifySms: false })
        .where(eq(clients.id, client.id));
    }
  }

  return new NextResponse(TWIML_EMPTY, {
    headers: { 'Content-Type': 'text/xml' },
  });
}
