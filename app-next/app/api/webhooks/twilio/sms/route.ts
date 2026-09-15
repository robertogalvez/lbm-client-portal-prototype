// Twilio's "A message comes in" webhook, configured on the LBM Portal
// number in the Twilio Console to point here. Delivers replies to the
// A2P 10DLC opt-in disclosure (see lib/sms-optin.ts) — a client replying
// YES/STOP against the number this app texts from.
import { createHmac, timingSafeEqual } from 'crypto';
import { applyInboundSmsReply } from '@/lib/sms-optin';

// Twilio's request-signing scheme: HMAC-SHA1 over the exact webhook URL
// with every POST param's key+value appended (sorted by key, no
// separators), keyed with the Account Auth Token — not the API Key
// Secret used for outbound sends, which can't validate inbound requests.
function isValidTwilioSignature(url: string, params: Record<string, string>, signature: string, authToken: string): boolean {
  const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url);
  const expected = createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  const expectedBuf = Buffer.from(expected);
  const receivedBuf = Buffer.from(signature);
  return expectedBuf.length === receivedBuf.length && timingSafeEqual(expectedBuf, receivedBuf);
}

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

export async function POST(req: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return new Response('Twilio not configured', { status: 500 });

  const rawBody = await req.text();
  const params = Object.fromEntries(new URLSearchParams(rawBody));
  const signature = req.headers.get('x-twilio-signature') ?? '';
  if (!isValidTwilioSignature(req.url, params, signature, authToken)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const from = params.From;
  const body = params.Body;
  if (from && body) {
    await applyInboundSmsReply(from, body);
  }

  // Twilio's own Advanced Opt-Out sends the registered STOP/HELP replies
  // automatically — this webhook only needs to update our DB state, never
  // reply itself, so it always returns empty TwiML.
  return new Response(EMPTY_TWIML, { status: 200, headers: { 'Content-Type': 'text/xml' } });
}
