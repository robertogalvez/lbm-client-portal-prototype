// Small Twilio SMS helper (same raw-fetch style as lib/email.ts's Postmark
// call — no SDK dependency). Pending Twilio credentials: this safely no-ops
// (logs + returns false) until TWILIO_ACCOUNT_SID / TWILIO_API_KEY_SID /
// TWILIO_API_KEY_SECRET / TWILIO_FROM_NUMBER are set, so the notifyMethod:
// 'sms' preference can be configured in Settings today and will start
// working the moment the credentials are added — no code change needed then.
//
// Auth uses a scoped API Key (SID starting with "SK" + its Secret) rather
// than the account's main Auth Token — Twilio treats an API Key SID/Secret
// pair as a drop-in Basic Auth credential for the same REST endpoints, and
// it can be revoked independently without rotating the Auth Token. The
// Account SID (starting with "AC") is still required separately — it's the
// account the message is sent from (used in the URL path), not part of the
// credential pair.

export function isSmsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET && process.env.TWILIO_FROM_NUMBER);
}

export async function sendSms(opts: { to: string; body: string }): Promise<boolean> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !apiKeySid || !apiKeySecret || !from) {
    console.error('[sendSms] Twilio not configured (missing TWILIO_ACCOUNT_SID/TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET/TWILIO_FROM_NUMBER)');
    return false;
  }
  if (!opts.to) return false;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64')}`,
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
