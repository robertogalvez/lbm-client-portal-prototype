// Small Twilio SMS helper (same raw-fetch style as lib/email.ts's Postmark
// call — no SDK dependency).
//
// Auth: prefers API Key pair (TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET)
// which is more secure and works for all REST endpoints. Falls back to
// ACCOUNT_SID:AUTH_TOKEN if only the auth token is present.
// TWILIO_AUTH_TOKEN is still required by the webhook route for HMAC validation.
//
// Safely no-ops (logs + returns false) if any required env var is missing,
// so notifySms can be configured in the UI today and will start working the
// moment the vars are set — no code change needed then.

export function isSmsConfigured(): boolean {
  const hasAccountSid = !!process.env.TWILIO_ACCOUNT_SID;
  const hasFromNumber = !!process.env.TWILIO_FROM_NUMBER;
  const hasApiKey = !!(process.env.TWILIO_API_KEY_SID && process.env.TWILIO_API_KEY_SECRET);
  const hasAuthToken = !!process.env.TWILIO_AUTH_TOKEN;
  return hasAccountSid && hasFromNumber && (hasApiKey || hasAuthToken);
}

// Sends the Twilio-compliant opt-in disclosure message. Must be called once
// when an admin enables SMS notifications for a user (notifySms: false→true).
// The user replies YES to confirm enrollment, or STOP to decline.
export async function sendSmsConsent({ to }: { to: string }): Promise<boolean> {
  const appUrl = (process.env.APP_URL ?? '').replace(/\/$/, '');
  const body = [
    "LBM Media: You've been enrolled for portal notifications (up to 2 msg/month).",
    'Msg & data rates may apply.',
    'Reply STOP to opt out, HELP for help.',
    `Terms: ${appUrl}/terms  Privacy: ${appUrl}/privacy`,
    'Reply YES to confirm enrollment, or STOP to decline.',
  ].join(' ');
  return sendSms({ to, body });
}

export async function sendSms(opts: { to: string; body: string }): Promise<boolean> {
  console.log('[sendSms] called with to:', JSON.stringify(opts.to));
  const accountSid   = process.env.TWILIO_ACCOUNT_SID;
  const apiKeySid    = process.env.TWILIO_API_KEY_SID;
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
  const authToken    = process.env.TWILIO_AUTH_TOKEN;
  const from         = process.env.TWILIO_FROM_NUMBER;

  if (!accountSid || !from) {
    const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_FROM_NUMBER'].filter(k => !process.env[k]);
    console.error('[sendSms] Twilio not configured — missing:', missing.join(', '));
    return false;
  }

  // Prefer API Key auth; fall back to Auth Token
  let authCredential: string;
  if (apiKeySid && apiKeySecret) {
    authCredential = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');
    console.log('[sendSms] using API Key auth, keySid prefix:', apiKeySid.slice(0, 8));
  } else if (authToken) {
    authCredential = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    console.log('[sendSms] using Auth Token auth');
  } else {
    console.error('[sendSms] no auth credentials — set TWILIO_API_KEY_SID+TWILIO_API_KEY_SECRET or TWILIO_AUTH_TOKEN');
    return false;
  }

  if (!opts.to) {
    console.error('[sendSms] no `to` number — returning false silently');
    return false;
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authCredential}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[sendSms] Twilio error status:', res.status, 'body:', JSON.stringify(data));
      return false;
    }
    console.log('[sendSms] sent to', opts.to, '— sid:', (data as { sid?: string }).sid);
    return true;
  } catch (err) {
    console.error('[sendSms] exception:', err);
    return false;
  }
}
