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
import { markPostingFailed } from './posting-failed';

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
function boolValue(field: clickup.ClickUpFieldLite | undefined): boolean {
  const v = field?.value;
  return v === true || v === 'true' || v === 1 || v === '1';
}

// The order to publish: Posted Status = "Post on Socials". "Do not post" (or
// unset) means the client decides where it goes — we never send it to Vista Social.
export function isPostOrder(postedStatus: string | null): boolean {
  return !!postedStatus && /post on socials/i.test(postedStatus);
}

// On a hard failure: notify in the task comments and set "Posted Status" =
// "Posting Failed" (so it isn't silently retried and the AM sees it).
async function markError(task: clickup.ClickUpTaskLite, comment: string): Promise<PublishOutcome> {
  await markPostingFailed(task, comment);
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

export async function publishVideo(
  clickupTaskId: string,
  opts: { publishNow?: boolean } = {},
): Promise<PublishOutcome> {
  if (!publishConfigured()) {
    return { status: 'deferred', reason: 'Vista Social / Frame.io not configured' };
  }
  const task = await clickup.getTask(clickupTaskId);

  const captions = textValue(clickup.findFieldRef(task, clickup.FIELD.captions));
  const publishAtMs = dateMs(clickup.findFieldRef(task, clickup.FIELD.publishDate));
  const frameLink = textValue(clickup.findFieldRef(task, clickup.FIELD.frameLink));
  const clientName = optionName(clickup.findFieldRef(task, clickup.FIELD.clientName));
  const postedStatus = optionName(clickup.findFieldRef(task, clickup.FIELD.postedStatus));
  const readyToPublish = boolValue(clickup.findFieldRef(task, clickup.FIELD.readyToPublish));

  // Idempotency — never double-publish (tracked via the stored Vista Social ids;
  // this workspace has no "Publishing Status" field to key on).
  const [existing] = await db
    .select({ postId: videoCache.vistasocialPostId })
    .from(videoCache)
    .where(eq(videoCache.clickupTaskId, clickupTaskId))
    .limit(1);
  if (existing?.postId) return { status: 'already_published' };

  // Trigger gate: only publish when explicitly ordered (Posted Status = "Post on
  // Socials") AND validated ready (the "Ready to Publish?" checkbox). Anything
  // else — "Do not post", unset, or not-yet-ready — is a no-op, not an error.
  if (!isPostOrder(postedStatus)) {
    return { status: 'deferred', reason: 'Posted Status is not "Post on Socials"' };
  }
  if (!readyToPublish) {
    return { status: 'deferred', reason: 'Ready to Publish? is not checked' };
  }

  // 1. Validate (Make "Task is valid" / "could not be scheduled"). publishNow
  // (test override) skips the future-date requirement; a real publish needs a
  // future Publish Date.
  if (!captions) {
    return markError(task, AM_MESSAGES.notSchedulable());
  }
  if (!opts.publishNow && (!publishAtMs || publishAtMs <= Date.now())) {
    return markError(task, AM_MESSAGES.notSchedulable());
  }
  if (!frameLink) {
    return markError(task, AM_MESSAGES.frameioStackFailed('No Frame.io link on the task'));
  }
  const effectivePublishAtMs = opts.publishNow ? Date.now() : publishAtMs!;

  // 2. Resolve the final Frame.io asset.
  let asset: frameio.FinalAsset;
  try {
    asset = await frameio.resolveFinalAsset(frameLink);
  } catch (e) {
    const err = e as frameio.FrameioError;
    const msg = err?.stage === 'file'
      ? AM_MESSAGES.frameioFileFailed(err.message)
      : AM_MESSAGES.frameioStackFailed(err?.message ?? String(e));
    return markError(task,msg);
  }
  // Not transcoded / no download URL yet — defer without erroring; the reconcile
  // pass retries once Frame.io finishes processing.
  if (!asset.ready || !asset.downloadUrl) {
    return { status: 'deferred', reason: `Frame.io asset not ready (status: ${asset.status ?? 'unknown'})` };
  }

  // 3. Resolve Vista Social profiles for the client.
  if (!clientName) {
    return markError(task,AM_MESSAGES.noProfile('(unknown client)'));
  }
  const profileIds = await resolveProfileIds(clientName);
  if (profileIds.length === 0) {
    return markError(task,AM_MESSAGES.noProfile(clientName));
  }

  // 4. Create the post — Vista Social fetches the media from the Frame.io URL.
  let result: vista.SchedulePostResult;
  try {
    result = await vista.schedulePost({
      profileIds,
      caption: captions,
      publishAtMs: effectivePublishAtMs,
      mediaUrl: asset.downloadUrl,
      instagramPublishAs: 'REELS',
      publishNow: opts.publishNow,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return markError(task,AM_MESSAGES.publishFailed(profileIds.join(', '), msg));
  }

  // 5. Success — store the post ids for the capture poller (no task comment; the
  // Instagram URL lands on the task's "Instagram URL" field once the post is live).
  await cacheAfterPublish(clickupTaskId, result.ids, effectivePublishAtMs);

  return { status: 'published', postIds: result.ids };
}
