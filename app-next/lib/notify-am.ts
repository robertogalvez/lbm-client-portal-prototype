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
  action: 'approve' | 'approve_with_fixes' | 'changes';
  clientName: string | null;
}

async function getAmContact(assignedAmName: string) {
  const [am] = await db
    .select({ email: authUsers.email, phone: authUsers.phone, notifyMethod: authUsers.notifyMethod })
    .from(authUsers)
    .where(and(eq(authUsers.role, 'account_manager'), eq(authUsers.amName, assignedAmName)))
    .limit(1);
  return am;
}

export async function notifyAmOfDecision(notice: DecisionNotice): Promise<void> {
  if (!notice.assignedAmName) return;
  try {
    const am = await getAmContact(notice.assignedAmName);
    if (!am || am.notifyMethod === 'none') return;

    const taskUrl = `https://app.clickup.com/t/${notice.taskId}`;
    const who = notice.clientName ?? 'A client';
    const isCaptionFix = notice.action === 'approve_with_fixes';
    const verb = notice.action === 'changes' ? 'requested changes on' : 'approved';
    // The caption-fix case gets its own copy, not just a verb swap — the AM
    // needs to see the "fix it before it posts" instruction, not infer it.
    const subject = isCaptionFix
      ? `Fix the caption before posting: "${notice.videoTitle}"`
      : `${who} ${verb} "${notice.videoTitle}"`;
    const bodyText = isCaptionFix
      ? `${who} approved <strong>${notice.videoTitle}</strong> and it's headed to the posting queue — but asked for the caption to be fixed first. Please fix it before it goes out.`
      : `${who} just <strong>${verb}</strong> <strong>${notice.videoTitle}</strong>.`;
    const smsText = isCaptionFix
      ? `LBM Portal: ${who} approved "${notice.videoTitle}" (posting queue) but the caption needs a fix before it posts. ${taskUrl}`
      : `LBM Portal: ${who} ${verb} "${notice.videoTitle}". ${taskUrl}`;

    if (am.notifyMethod === 'email') {
      if (!am.email) return;
      await sendEmail({
        to: am.email,
        subject,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;">${bodyText}</p>
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
      await sendSms({ to: am.phone, body: smsText });
    }
  } catch (e) {
    console.error('[notifyAmOfDecision] failed:', e);
  }
}

// A video that's been sitting in "for client review" for 24h+ with no client
// decision — nudges the assigned AM to follow up with the client directly,
// since ClickUp itself won't surface this on its own. Fired by the idle-review
// reminder cron (app/api/reminders/idle-review), which also guarantees this
// fires at most once per review round (see video_cache.reviewIdleRemindedAt).
export interface IdleReviewNotice {
  assignedAmName: string | null;
  taskId: string;
  videoTitle: string;
  clientName: string | null;
  hoursIdle: number;
}

export async function notifyAmOfIdleReview(notice: IdleReviewNotice): Promise<void> {
  if (!notice.assignedAmName) return;
  try {
    const am = await getAmContact(notice.assignedAmName);
    if (!am || am.notifyMethod === 'none') return;

    const taskUrl = `https://app.clickup.com/t/${notice.taskId}`;
    const who = notice.clientName ?? 'The client';
    const hours = Math.floor(notice.hoursIdle);

    if (am.notifyMethod === 'email') {
      if (!am.email) return;
      await sendEmail({
        to: am.email,
        subject: `Still awaiting review: "${notice.videoTitle}"`,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;"><strong>${notice.videoTitle}</strong> has been waiting on ${who} for over ${hours} hours with no decision yet.</p>
            <p style="font-size: 14px; color: #54616f; margin: 0 0 24px;">Might be worth a follow-up.</p>
            <a href="${taskUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Open the task in ClickUp
            </a>
          </div>
        `,
      });
    } else if (am.notifyMethod === 'sms') {
      if (!am.phone) return;
      if (!isSmsConfigured()) {
        console.warn('[notifyAmOfIdleReview] notifyMethod is "sms" but Twilio is not configured yet — skipping');
        return;
      }
      await sendSms({ to: am.phone, body: `LBM Portal: "${notice.videoTitle}" has been awaiting ${who}'s review for ${hours}h+. Worth a follow-up. ${taskUrl}` });
    }
  } catch (e) {
    console.error('[notifyAmOfIdleReview] failed:', e);
  }
}

// A video the client just moved to the #1 spot in their production priority
// order (→ ClickUp Priority "Urgent", see lib/priority.ts). Fired only when
// the top-priority video actually changes, not on every reorder — otherwise
// a client fine-tuning the order of their lower-priority videos would spam
// the AM. See app/api/client/priority.
export interface PriorityChangeNotice {
  assignedAmName: string | null;
  taskId: string;
  videoTitle: string;
  clientName: string | null;
}

export async function notifyAmOfPriorityChange(notice: PriorityChangeNotice): Promise<void> {
  if (!notice.assignedAmName) return;
  try {
    const am = await getAmContact(notice.assignedAmName);
    if (!am || am.notifyMethod === 'none') return;

    const taskUrl = `https://app.clickup.com/t/${notice.taskId}`;
    const who = notice.clientName ?? 'A client';

    if (am.notifyMethod === 'email') {
      if (!am.email) return;
      await sendEmail({
        to: am.email,
        subject: `Top priority: "${notice.videoTitle}"`,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;">${who} just marked <strong>${notice.videoTitle}</strong> as their top priority.</p>
            <a href="${taskUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Open the task in ClickUp
            </a>
          </div>
        `,
      });
    } else if (am.notifyMethod === 'sms') {
      if (!am.phone) return;
      if (!isSmsConfigured()) {
        console.warn('[notifyAmOfPriorityChange] notifyMethod is "sms" but Twilio is not configured yet — skipping');
        return;
      }
      await sendSms({ to: am.phone, body: `LBM Portal: ${who} marked "${notice.videoTitle}" as top priority. ${taskUrl}` });
    }
  } catch (e) {
    console.error('[notifyAmOfPriorityChange] failed:', e);
  }
}

// The publish pipeline's success/failure was previously silent outside a
// ClickUp task comment on failure only (see lib/publish/posting-failed.ts) —
// nothing told the AM a video actually went live, and even the failure
// comment relied on someone spotting it in ClickUp. Fired from
// lib/publish/publish-video.ts (success) and posting-failed.ts (failure,
// covering both the schedule-time and capture-poller failure paths).
export interface PublishResultNotice {
  assignedAmName: string | null;
  taskId: string;
  videoTitle: string;
  result: 'published' | 'error';
  reason?: string;
}

export async function notifyAmOfPublishResult(notice: PublishResultNotice): Promise<void> {
  if (!notice.assignedAmName) return;
  try {
    const am = await getAmContact(notice.assignedAmName);
    if (!am || am.notifyMethod === 'none') return;

    const taskUrl = `https://app.clickup.com/t/${notice.taskId}`;
    const published = notice.result === 'published';

    if (am.notifyMethod === 'email') {
      if (!am.email) return;
      await sendEmail({
        to: am.email,
        subject: published ? `Published: "${notice.videoTitle}"` : `Publish failed: "${notice.videoTitle}"`,
        htmlBody: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
            <p style="font-size: 16px; color: #111c28; margin: 0 0 16px;">
              ${published
                ? `<strong>${notice.videoTitle}</strong> was just published to socials.`
                : `<strong>${notice.videoTitle}</strong> failed to publish${notice.reason ? `: ${notice.reason}` : ''}.`}
            </p>
            <a href="${taskUrl}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
              Open the task in ClickUp
            </a>
          </div>
        `,
      });
    } else if (am.notifyMethod === 'sms') {
      if (!am.phone) return;
      if (!isSmsConfigured()) {
        console.warn('[notifyAmOfPublishResult] notifyMethod is "sms" but Twilio is not configured yet — skipping');
        return;
      }
      const body = published
        ? `LBM Portal: "${notice.videoTitle}" was published to socials. ${taskUrl}`
        : `LBM Portal: "${notice.videoTitle}" failed to publish. ${taskUrl}`;
      await sendSms({ to: am.phone, body });
    }
  } catch (e) {
    console.error('[notifyAmOfPublishResult] failed:', e);
  }
}
