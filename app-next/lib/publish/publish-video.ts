// Native publish pipeline — replaces the Make.com "Integration ClickUp, Vista
// Social, Frame.io" scenario. Given a ClickUp video task it validates, resolves
// the final Frame.io asset, resolves the client's Vista Social profiles, ingests
// the media, and schedules the post — posting the exact AM comments from the
// blueprint on every failure and recording the returned post ids for the capture
// poller to resolve into a live Instagram URL later.

import { db } from '@/lib/db';
import { clients, videoCache } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as clickup from '@/lib/clickup-write';
import * as frameio from '@/lib/frameio';
import * as vista from '@/lib/vistasocial';
import { AM_MESSAGES } from './messages';

export type PublishOutcome =
  | { status: 'published'; postIds: string[] }
  | { status: 'already_published' }
  | { status: 'deferred'; reason: string }   // not ready yet — reconcile will retry, no error posted
  | { status: 'error'; reason: string };

function optionName(field: clickup.ClickUpFieldLite | undefined): string | null {
  if (!field || typeof field.value !== 'number') return null;
  return field.type_config?.options?.[field.value]?.name ?? null;
}
function textValue(field: clickup.ClickUpFieldLite | undefined): string | null {
  return typeof field?.value === 'string' && field.value.trim() ? field.value : null;
}
function dateMs(field: clickup.ClickUpFieldLite | undefined): number | null {
  const v = field?.value;
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function markError(taskId: string, task: clickup.ClickUpTaskLite, comment: string): Promise<PublishOutcome> {
  await clickup.postComment(taskId, comment);
  await clickup.setDropdownByName(task, clickup.FIELDS.publishingStatus, clickup.PUBLISHING_STATUS.error);
  return { status: 'error', reason: comment };
}

async function resolveProfileIds(clientName: string): Promise<string[]> {
  const [row] = await db
    .select({ branding: clients.brandingConfig })
    .from(clients)
    .where(eq(clients.name, clientName))
    .limit(1);
  const raw = (row?.branding as { vistaSocialProfileIds?: string } | null)?.vistaSocialProfileIds;
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

async function cacheAfterPublish(taskId: string, postIds: string[], scheduledAtMs: number): Promise<void> {
  const set = {
    vistasocialPostId: postIds.join(','),
    vistasocialScheduledAt: new Date(scheduledAtMs),
    publishingStatus: clickup.PUBLISHING_STATUS.published,
    lastSyncedAt: new Date(),
  };
  await db
    .insert(videoCache)
    .values({ clickupTaskId: taskId, ...set })
    .onConflictDoUpdate({ target: videoCache.clickupTaskId, set });
}

// True only when the native publish pipeline has the credentials it needs.
// Callers gate on this so we never spam error comments before go-live.
export function publishConfigured(): boolean {
  return vista.isConfigured() && frameio.isConfigured();
}

export async function publishVideo(clickupTaskId: string): Promise<PublishOutcome> {
  if (!publishConfigured()) {
    return { status: 'deferred', reason: 'Vista Social / Frame.io not configured' };
  }
  const task = await clickup.getTask(clickupTaskId);

  const publishingStatus = optionName(clickup.findField(task, clickup.FIELDS.publishingStatus));
  const captions = textValue(clickup.findField(task, clickup.FIELDS.captions));
  const publishAtMs = dateMs(clickup.findField(task, clickup.FIELDS.publishDate));
  const frameLink = textValue(clickup.findField(task, clickup.FIELDS.frameLink));
  const clientName = optionName(clickup.findField(task, clickup.FIELDS.clientName));

  // Idempotency — never double-publish.
  if (publishingStatus === clickup.PUBLISHING_STATUS.published) return { status: 'already_published' };
  const [existing] = await db
    .select({ postId: videoCache.vistasocialPostId })
    .from(videoCache)
    .where(eq(videoCache.clickupTaskId, clickupTaskId))
    .limit(1);
  if (existing?.postId) return { status: 'already_published' };

  // 1. Validate (Make "Task is valid" / "could not be scheduled").
  if (!captions || !publishAtMs || publishAtMs <= Date.now()) {
    return markError(clickupTaskId, task, AM_MESSAGES.notSchedulable());
  }
  if (!frameLink) {
    return markError(clickupTaskId, task, AM_MESSAGES.frameioStackFailed('No Frame.io link on the task'));
  }

  // 2. Resolve the final Frame.io asset.
  let asset: frameio.FinalAsset;
  try {
    asset = await frameio.resolveFinalAsset(frameLink);
  } catch (e) {
    const err = e as frameio.FrameioError;
    const msg = err?.stage === 'file'
      ? AM_MESSAGES.frameioFileFailed(err.message)
      : AM_MESSAGES.frameioStackFailed(err?.message ?? String(e));
    return markError(clickupTaskId, task, msg);
  }
  // Not transcoded / no download URL yet — defer without erroring; the reconcile
  // pass retries once Frame.io finishes processing.
  if (!asset.ready || !asset.downloadUrl) {
    return { status: 'deferred', reason: `Frame.io asset not ready (status: ${asset.status ?? 'unknown'})` };
  }

  // 3. Resolve Vista Social profiles for the client.
  if (!clientName) {
    return markError(clickupTaskId, task, AM_MESSAGES.noProfile('(unknown client)'));
  }
  const profileIds = await resolveProfileIds(clientName);
  if (profileIds.length === 0) {
    return markError(clickupTaskId, task, AM_MESSAGES.noProfile(clientName));
  }

  // 4. Ingest media into Vista Social (falls back to the direct URL if needed).
  let mediaId: string | undefined;
  try {
    mediaId = await vista.createMedia(asset.downloadUrl);
  } catch {
    mediaId = undefined; // fall back to media_url on schedule()
  }

  // 5. Schedule the post.
  let result: vista.SchedulePostResult;
  try {
    result = await vista.schedulePost({
      profileIds,
      caption: captions,
      publishAtMs,
      mediaId,
      mediaUrl: mediaId ? undefined : asset.downloadUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return markError(clickupTaskId, task, AM_MESSAGES.publishFailed(profileIds.join(', '), msg));
  }

  // 6. Success — mark Published, store post ids, comment.
  await clickup.setDropdownByName(task, clickup.FIELDS.publishingStatus, clickup.PUBLISHING_STATUS.published);
  await cacheAfterPublish(clickupTaskId, result.ids, publishAtMs);
  await clickup.postComment(clickupTaskId, AM_MESSAGES.publishSuccess());

  return { status: 'published', postIds: result.ids };
}
