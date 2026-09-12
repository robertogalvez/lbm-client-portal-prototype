// Small Twilio SMS helper (same raw-fetch style as lib/email.ts's Postmark
// call — no SDK dependency). Auth uses TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN
// for HTTP Basic Auth, which Twilio accepts for all REST endpoints.
// TWILIO_AUTH_TOKEN is already required by the webhook route for HMAC
// validation, so no extra credentials are needed.
//
// Safely no-ops (logs + returns false) if any required env var is missing,
// so notifySms can be configured in the UI today and will start working the
// moment the vars are set — no code change needed then.

export function isSmsConfigured(): boolean {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
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
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const from       = process.env.TWILIO_FROM_NUMBER;
  if (!accountSid || !authToken || !from) {
    const missing = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'].filter(k => !process.env[k]);
    console.error('[sendSms] Twilio not configured — missing:', missing.join(', '));
    return false;
  }
  if (!opts.to) return false;

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: opts.to, From: from, Body: opts.body }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[sendSms] Twilio error:', data);
      return false;
    }
    console.log('[sendSms] sent to', opts.to, '— sid:', (data as { sid?: string }).sid);
    return true;
  } catch (err) {
    console.error('[sendSms] exception:', err);
    return false;
  }
}
