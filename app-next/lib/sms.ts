// Small Twilio SMS helper (same raw-fetch style as lib/email.ts's Postmark
// call — no SDK dependency). Pending a Twilio account: this safely no-ops
// (logs + returns false) until TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /
// TWILIO_FROM_NUMBER are set, so the notifyMethod: 'sms' preference can be
// configured in Settings today and will start working the moment the API
// key is added — no code change needed then.

export function isSmsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendSms(opts: { to: string; body: string }): Promise<boolean> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.error('[sendSms] Twilio not configured (missing TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_FROM_NUMBER)');
    return false;
  }
  if (!opts.to) return false;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[sendSms] Twilio error:', data);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sendSms] exception:', err);
    return false;
  }
}
