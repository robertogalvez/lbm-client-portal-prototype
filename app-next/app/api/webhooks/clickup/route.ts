import { createHmac, timingSafeEqual } from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache, clients } from '@/lib/db/schema';
import { mapTask } from '@/lib/clickup';
import { publishVideo } from '@/lib/publish/publish-video';
import { notifyClientReviewReady } from '@/lib/notify-client';
import { eq } from 'drizzle-orm';
import * as clickupWrite from '@/lib/clickup-write';
import * as frameio from '@/lib/frameio';

function normStatus(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature') ?? '';
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(expected, received)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = JSON.parse(rawBody) as { event: string; task_id: string };
  const { event, task_id } = body;

  if (event === 'taskDeleted') {
    await db.delete(videoCache).where(eq(videoCache.clickupTaskId, task_id));
    return NextResponse.json({ ok: true });
  }

  // Fetch full task from ClickUp
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${task_id}?custom_fields=true`,
    {
      headers: {
        Authorization: process.env.CLICKUP_API_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    return new Response(`ClickUp API error: ${res.status}`, { status: 502 });
  }

  const task = await res.json();

  // Skip upsert if row has dirty = true
  const existing = await db
    .select({ dirty: videoCache.dirty, status: videoCache.status, frameioAssetId: videoCache.frameioAssetId })
    .from(videoCache)
    .where(eq(videoCache.clickupTaskId, task_id))
    .limit(1);

  if (existing[0]?.dirty) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mapped = mapTask(task);

  await db
    .insert(videoCache)
    .values({
      clickupTaskId:     mapped.clickupTaskId,
      clientId:          mapped.clientOptionId,
      editorId:          null,
      assignedAmId:      null,
      title:             mapped.title,
      status:            mapped.status,
      clientApproval:    mapped.clientApproval,
      captionApproval:   mapped.captionApproval,
      videoLevel:        mapped.videoLevel,
      caption:           mapped.caption,
      publishingStatus:  mapped.publishingStatus,
      frameioAssetId:    mapped.frameLink,
      rawDriveLink:      mapped.rawDriveLink,
      vistasocialPostId: null,
      instagramUrl:      mapped.instagramUrl,
      assignedAmName:    mapped.assignedAmName,
      editorName:        mapped.editorName,
      clientName:        mapped.clientName,
      qualityCheck:      mapped.qualityCheck,
      isYoutube:         mapped.isYoutube,
      dateUpdated:       mapped.dateUpdated,
      dueDate:           mapped.dueDate,
      lastSyncedAt:      new Date(),
    })
    .onConflictDoUpdate({
      target: videoCache.clickupTaskId,
      set: {
        clientId:          mapped.clientOptionId,
        title:             mapped.title,
        status:            mapped.status,
        clientApproval:    mapped.clientApproval,
        captionApproval:   mapped.captionApproval,
        videoLevel:        mapped.videoLevel,
        caption:           mapped.caption,
        publishingStatus:  mapped.publishingStatus,
        frameioAssetId:    mapped.frameLink,
        rawDriveLink:      mapped.rawDriveLink,
        instagramUrl:      mapped.instagramUrl,
        assignedAmName:    mapped.assignedAmName,
        editorName:        mapped.editorName,
        clientName:        mapped.clientName,
        qualityCheck:      mapped.qualityCheck,
        isYoutube:         mapped.isYoutube,
        dateUpdated:       mapped.dateUpdated,
        dueDate:           mapped.dueDate,
        lastSyncedAt:      new Date(),
      },
    });

  // Frame.io link changed — resolve the signed, high-quality download URL and
  // mirror it onto a plain ClickUp field. This exists so tools that only see
  // ClickUp (e.g. ClickUp Brain driving Vista Social's MCP) can read a usable
  // media URL without needing our Frame.io OAuth credentials themselves.
  // Best-effort: the reconcile cron + the next webhook fire (re-comparing
  // against the cached value) are the retry path, so a failure here is never
  // fatal to the rest of the webhook.
  const frameLinkChanged = !!mapped.frameLink && mapped.frameLink !== existing[0]?.frameioAssetId;
  if (frameLinkChanged && frameio.isConfigured()) {
    try {
      const asset = await frameio.resolveFinalAsset(mapped.frameLink!);
      if (asset.ready && asset.downloadUrl) {
        await clickupWrite.setUrlField(task, clickupWrite.FIELD.vistaMediaUrl, asset.downloadUrl);
      }
    } catch (e) {
      console.error('Frame.io → Vista Social media URL mirror failed:', e instanceof Error ? e.message : e);
    }
  }

  // The moment a video actually ENTERS "for client review" — guarded to the
  // transition itself (previous status wasn't already "for client review"),
  // not every subsequent webhook fired while it sits there, so an AM/editor
  // touching an unrelated field mid-review doesn't re-fire this each time.
  const enteringReview = normStatus(mapped.status) === 'for client review' && normStatus(existing[0]?.status) !== 'for client review';
  if (enteringReview) {
    // Stamp the review clock (used by the 24h idle-review reminder — see
    // app/api/reminders/idle-review) and reset the "AM already reminded"
    // guard for this fresh round.
    await db
      .update(videoCache)
      .set({ reviewEnteredAt: new Date(), reviewIdleRemindedAt: null })
      .where(eq(videoCache.clickupTaskId, task_id));

    if (mapped.clientName) {
      await notifyClientReviewReady({
        clientName: mapped.clientName,
        taskId: mapped.clickupTaskId,
        videoTitle: mapped.clientFacingTitle || mapped.title,
        portalOrigin: new URL(req.url).origin,
      });
    }
  }

  // Advisory: warn if task moved to "for client review" without a caption (non-one-time clients)
  if (mapped.status.toLowerCase().includes('client review') && !mapped.caption && mapped.clientName) {
    const clientRows = await db
      .select({ type: clients.type })
      .from(clients)
      .where(eq(clients.name, mapped.clientName))
      .limit(1);
    const clientType = clientRows[0]?.type ?? '';
    if (clientType !== 'one-time') {
      await fetch(
        `https://api.clickup.com/api/v2/task/${task_id}/comment`,
        {
          method: 'POST',
          headers: {
            Authorization: process.env.CLICKUP_API_TOKEN ?? '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ comment_text: '⚠️ Caption is missing — please add a caption before the client reviews this video.' }),
        }
      );
    }
  }

  // Fast-path publish trigger: the order to post is task Status = "Ready to be
  // Posted", gated by the "Ready to Publish?" validation checkbox, blocked by
  // "Posted Status" = "Do not post" (client posts it themselves). publishVideo
  // re-checks all of this plus idempotency, so re-fires are safe.
  type RawField = { name: string; value?: unknown; type_config?: { options?: { name: string }[] } };
  const fields = (task.custom_fields ?? []) as RawField[];
  const findRaw = (name: string) => fields.find(f => f.name === name);
  const nativeStatus = mapped.status.toLowerCase().replace(/\s+/g, ' ').trim();
  const readyField = findRaw('Ready to Publish?');
  const isReady = readyField?.value === true || readyField?.value === 'true' || readyField?.value === 1;
  const posted = findRaw('Posted Status');
  const postedName = typeof posted?.value === 'number' ? posted?.type_config?.options?.[posted.value]?.name : null;
  const doNotPost = postedName ? /do not post/i.test(postedName) : false;
  if (nativeStatus === 'ready to be posted' && isReady && !doNotPost) {
    try {
      await publishVideo(task_id);
    } catch (e) {
      console.error('publishVideo failed in webhook:', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json({ ok: true });
}
