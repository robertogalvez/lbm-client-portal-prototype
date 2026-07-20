import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import type { MappedTask } from '@/lib/clickup';

export async function getTasksFromDB(): Promise<MappedTask[]> {
  // Explicit column list — only what mapping below needs (skips editorId,
  // assignedAmId, vistasocialPostId, dirty).
  const rows = await db
    .select({
      clickupTaskId:          videoCache.clickupTaskId,
      title:                  videoCache.title,
      clientFacingTitle:      videoCache.clientFacingTitle,
      status:                 videoCache.status,
      clientId:               videoCache.clientId,
      clientName:             videoCache.clientName,
      videoLevel:             videoCache.videoLevel,
      clientApproval:         videoCache.clientApproval,
      captionApproval:        videoCache.captionApproval,
      publishingStatus:       videoCache.publishingStatus,
      qualityCheck:           videoCache.qualityCheck,
      caption:                videoCache.caption,
      frameioAssetId:         videoCache.frameioAssetId,
      rawDriveLink:           videoCache.rawDriveLink,
      instagramUrl:           videoCache.instagramUrl,
      assignedAmName:         videoCache.assignedAmName,
      editorName:             videoCache.editorName,
      isYoutube:              videoCache.isYoutube,
      revisions:              videoCache.revisions,
      dateUpdated:            videoCache.dateUpdated,
      dueDate:                videoCache.dueDate,
      lastSyncedAt:           videoCache.lastSyncedAt,
      vistasocialScheduledAt: videoCache.vistasocialScheduledAt,
    })
    .from(videoCache);
  return rows.map(row => ({
    clickupTaskId:    row.clickupTaskId,
    title:            row.title ?? '',
    clientFacingTitle: row.clientFacingTitle ?? null,
    status:           row.status ?? '',
    clientOptionId:   row.clientId ?? null,
    clientName:       row.clientName ?? null,
    videoLevel:       row.videoLevel ?? null,
    clientApproval:   row.clientApproval ?? null,
    captionApproval:  row.captionApproval ?? null,
    publishingStatus: row.publishingStatus ?? null,
    qualityCheck:     row.qualityCheck ?? null,
    caption:          row.caption ?? null,
    frameLink:        row.frameioAssetId ?? null,
    rawDriveLink:     row.rawDriveLink ?? null,
    instagramUrl:     row.instagramUrl ?? null,
    assignedAmName:   row.assignedAmName ?? null,
    editorName:       row.editorName ?? null,
    isYoutube:        row.isYoutube ?? false,
    revisions:        row.revisions ?? null,
    dateUpdated:      row.dateUpdated ?? String(row.lastSyncedAt?.getTime() ?? Date.now()),
    dueDate:          row.dueDate ?? null,
    publishDate:      row.vistasocialScheduledAt?.toISOString() ?? null,
  }));
}
