// Frame.io re-authorization reminder. Called by the scheduled shim. When the
// Frame.io refresh token is within ~2 days of its 30-day expiry (and we haven't
// already emailed this cycle), emails all admins with a link to renew. Deduped
// via oauth_tokens.alerted_at (reset on each successful authorization).

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getConnectionStatus, markAlerted } from '@/lib/frameio';
import { sendEmail } from '@/lib/email';

const ALERT_WINDOW_DAYS = 2;

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const conn = await getConnectionStatus();
  // Only oauth-mode connections expire; override/disconnected have nothing to remind.
  if (conn.mode !== 'oauth' || conn.daysUntilReauth === null) {
    return NextResponse.json({ ok: true, action: 'none', mode: conn.mode });
  }
  if (conn.daysUntilReauth > ALERT_WINDOW_DAYS) {
    return NextResponse.json({ ok: true, action: 'none', daysUntilReauth: conn.daysUntilReauth });
  }
  if (conn.alertedAt) {
    return NextResponse.json({ ok: true, action: 'already_alerted' });
  }

  const admins = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.role, 'admin'));
  const emails = admins.map(a => a.email).filter(Boolean);
  if (emails.length === 0) return NextResponse.json({ ok: true, action: 'no_admins' });

  const settingsUrl = `${new URL(req.url).origin}/settings`;
  const expiresLabel = conn.daysUntilReauth <= 0
    ? 'has expired'
    : `expires in ${conn.daysUntilReauth} day${conn.daysUntilReauth === 1 ? '' : 's'}`;

  const sent = await sendEmail({
    to: emails,
    subject: 'Action needed: renew Frame.io authorization (LBM Portal)',
    htmlBody: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;">The Frame.io authorization that powers auto-publishing to Vista Social <strong>${expiresLabel}</strong>.</p>
        <p style="font-size: 14px; color: #54616f; margin: 0 0 24px;">Renew it now (takes ~30 seconds) so video publishing keeps working:</p>
        <a href="${settingsUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Renew Frame.io in Settings
        </a>
        <p style="font-size: 12px; color: #8b97a4; margin: 24px 0 0;">Frame.io requires re-authorization every 30 days.</p>
      </div>
    `,
  });

  if (sent) await markAlerted();
  return NextResponse.json({ ok: true, action: sent ? 'emailed' : 'email_failed', recipients: emails.length });
}
