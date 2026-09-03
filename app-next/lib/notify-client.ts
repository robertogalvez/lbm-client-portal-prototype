// Notifies a client when one of their videos becomes ready for review — the
// client-side counterpart to lib/notify-am.ts. Unlike the AM's single
// notifyMethod choice, a client can have any combination of channels on at
// once (independent toggles, admin-configured per client in the Clients
// page), so this can send both email and SMS for the same event.
//
// Never throws: a notification failure must not break the webhook that
// triggers it.

import { db } from '@/lib/db';
import { clients, authUsers } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { sendEmail } from '@/lib/email';
import { sendSms, isSmsConfigured } from '@/lib/sms';

export interface ReviewReadyNotice {
  clientName: string;
  taskId: string;
  videoTitle: string;
  portalOrigin: string;
}

export async function notifyClientReviewReady(notice: ReviewReadyNotice): Promise<void> {
  try {
    const [client] = await db
      .select({ contactEmail: clients.contactEmail, whatsappNumber: clients.whatsappNumber, notifyEmail: clients.notifyEmail, notifySms: clients.notifySms })
      .from(clients)
      .where(eq(clients.name, notice.clientName))
      .limit(1);
    if (!client) return;

    const videoUrl = `${notice.portalOrigin}/client/videos/${notice.taskId}`;

    if (client.notifyEmail) {
      // Recipients are the real portal accounts for this client, not the raw
      // ClickUp contactEmail field directly — the sync process (see
      // app/api/admin/clients/sync) already turns that address into the
      // client's primary portal account, so this reaches everyone who can
      // actually log in and act on the video. Falls back to contactEmail
      // itself if it hasn't been adopted into a portal account yet (e.g. sync
      // hasn't run, or the address collided with an unrelated account).
      const portalUsers = await db
        .select({ email: authUsers.email })
        .from(authUsers)
        .where(and(eq(authUsers.role, 'client'), eq(authUsers.clientName, notice.clientName)));
      const recipients = new Set(portalUsers.map(u => u.email.toLowerCase()));
      if (client.contactEmail) recipients.add(client.contactEmail.toLowerCase());

      if (recipients.size > 0) await sendEmail({
        to: Array.from(recipients),
        subject: `A new video is ready for your review: "${notice.videoTitle}"`,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;"><strong>${notice.videoTitle}</strong> is ready for your review.</p>
            <a href="${videoUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Watch &amp; review
            </a>
          </div>
        `,
      });
    }
    if (client.notifySms && client.whatsappNumber) {
      if (!isSmsConfigured()) {
        console.warn('[notifyClientReviewReady] notifySms is on but Twilio is not configured yet — skipping');
      } else {
        await sendSms({ to: client.whatsappNumber, body: `LBM Portal: "${notice.videoTitle}" is ready for your review. ${videoUrl}` });
      }
    }
  } catch (e) {
    console.error('[notifyClientReviewReady] failed:', e);
  }
}

export interface ReportReadyNotice {
  clientName: string;
  portalOrigin: string;
}

// Texts a client once their new monthly report is available — same SMS-only
// preference (notifySms + whatsappNumber) as the review-ready notice above.
// Never throws: called from a scheduled reminder, a failure here must not
// break the rest of that run.
export async function notifyClientReportReady(notice: ReportReadyNotice): Promise<void> {
  try {
    if (!isSmsConfigured()) return;

    const [client] = await db
      .select({ whatsappNumber: clients.whatsappNumber, notifySms: clients.notifySms })
      .from(clients)
      .where(eq(clients.name, notice.clientName))
      .limit(1);
    if (!client || !client.notifySms || !client.whatsappNumber) return;

    const reportUrl = `${notice.portalOrigin}/client?tab=report`;
    await sendSms({ to: client.whatsappNumber, body: `LBM Portal: your new monthly report is ready. ${reportUrl}` });
  } catch (e) {
    console.error('[notifyClientReportReady] failed:', e);
  }
}
