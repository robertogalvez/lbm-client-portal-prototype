// Notifies the AM assigned to a task when a client makes a decision (approve
// or request changes) — a channel separate from the ClickUp task comment
// (lib/frameio-comment-sync.ts, postComment), since that alone is easy to
// miss. Which channel (email, SMS, or none) is an admin-configured, per-AM
// preference set in Settings (authUsers.notifyMethod/phone), not something
// the AM opts into themselves.
//
// Never throws: a notification failure must not block the approval write.

import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { sendSms, isSmsConfigured } from '@/lib/sms';

export interface DecisionNotice {
  assignedAmName: string | null;
  taskId: string;
  videoTitle: string;
  action: 'approve' | 'changes';
  clientName: string | null;
}

export async function notifyAmOfDecision(notice: DecisionNotice): Promise<void> {
  if (!notice.assignedAmName) return;
  try {
    const [am] = await db
      .select({ email: authUsers.email, phone: authUsers.phone, notifyMethod: authUsers.notifyMethod })
      .from(authUsers)
      .where(and(eq(authUsers.role, 'account_manager'), eq(authUsers.amName, notice.assignedAmName)))
      .limit(1);
    if (!am || am.notifyMethod === 'none') return;

    const verb = notice.action === 'approve' ? 'approved' : 'requested changes on';
    const taskUrl = `https://app.clickup.com/t/${notice.taskId}`;
    const who = notice.clientName ?? 'A client';

    if (am.notifyMethod === 'email') {
      if (!am.email) return;
      await sendEmail({
        to: am.email,
        subject: `${who} ${verb} "${notice.videoTitle}"`,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;">${who} just <strong>${verb}</strong> <strong>${notice.videoTitle}</strong>.</p>
            <a href="${taskUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Open the task in ClickUp
            </a>
          </div>
        `,
      });
    } else if (am.notifyMethod === 'sms') {
      if (!am.phone) return;
      if (!isSmsConfigured()) {
        console.warn('[notifyAmOfDecision] notifyMethod is "sms" but Twilio is not configured yet — skipping');
        return;
      }
      await sendSms({ to: am.phone, body: `LBM Portal: ${who} ${verb} "${notice.videoTitle}". ${taskUrl}` });
    }
  } catch (e) {
    console.error('[notifyAmOfDecision] failed:', e);
  }
}
