// Monthly Frame.io renewal reminder. Called by the scheduled shim. Frame.io
// authorization must be renewed every 30 days; once per cycle — when the
// authorization enters its final week — this emails all admins a reminder to
// renew. Deduped via oauth_tokens.alerted_at (reset on each successful
// authorization), so admins get exactly one notice each ~monthly cycle.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getConnectionStatus, markAlerted } from '@/lib/frameio';
import { sendEmail } from '@/lib/email';

// Notify once the authorization is within its final week (a week's notice for
// the monthly renewal).
const ALERT_WINDOW_DAYS = 7;

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
    subject: 'Monthly reminder: renew the Frame.io connection (LBM Portal)',
    htmlBody: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
        <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;">This is your monthly reminder to renew the <strong>Frame.io connection</strong> that powers auto-publishing to Vista Social. It ${expiresLabel}.</p>
        <p style="font-size: 14px; color: #54616f; margin: 0 0 24px;">Renewing takes about 30 seconds and keeps video publishing running:</p>
        <a href="${settingsUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
          Renew Frame.io in Settings
        </a>
        <p style="font-size: 12px; color: #8b97a4; margin: 24px 0 0;">Frame.io requires re-authorization every 30 days, so you'll get this reminder once a month.</p>
      </div>
    `,
  });

  if (sent) await markAlerted();
  return NextResponse.json({ ok: true, action: sent ? 'emailed' : 'email_failed', recipients: emails.length });
}
