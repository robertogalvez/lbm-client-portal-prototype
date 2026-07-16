// Small Postmark email helper (same transport as the magic-link mailer in
// lib/auth.ts). Postmark accepts a comma-separated `To` (up to 50 recipients).

export async function sendEmail(opts: { to: string | string[]; subject: string; htmlBody: string }): Promise<boolean> {
  const token = process.env.POSTMARK_API_KEY;
  if (!token) {
    console.error('[sendEmail] POSTMARK_API_KEY not set');
    return false;
  }
  const to = Array.isArray(opts.to) ? opts.to.filter(Boolean).join(',') : opts.to;
  if (!to) return false;

  try {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Postmark-Server-Token': token,
      },
      body: JSON.stringify({
        From: 'LBM Portal <noreply@flowrk.ca>',
        To: to,
        Subject: opts.subject,
        HtmlBody: opts.htmlBody,
        MessageStream: 'outbound',
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[sendEmail] Postmark error:', data);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sendEmail] exception:', err);
    return false;
  }
}
