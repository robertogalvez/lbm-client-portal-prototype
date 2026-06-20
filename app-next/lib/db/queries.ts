import { db } from '@/lib/db';
import { videoCache, type VideoCache } from '@/lib/db/schema';
import type { MappedTask } from '@/lib/clickup';

export async function getTasksFromDB(): Promise<MappedTask[]> {
  const rows = await db.select().from(videoCache);
  return rows.map((row: VideoCache) => ({
    clickupTaskId:    row.clickupTaskId,
    title:            row.title ?? '',
    status:           row.status ?? '',
    clientOptionId:   row.clientId ?? null,
    clientName:       row.clientName ?? null,
    videoLevel:       row.videoLevel ?? null,
    clientApproval:   row.clientApproval ?? null,
    publishingStatus: row.publishingStatus ?? null,
    qualityCheck:     row.qualityCheck ?? null,
    caption:          row.caption ?? null,
    frameLink:        row.frameioAssetId ?? null,
    assignedAmName:   row.assignedAmName ?? null,
    editorName:       row.editorName ?? null,
    dateUpdated:      row.dateUpdated ?? String(row.lastSyncedAt?.getTime() ?? Date.now()),
    dueDate:          row.dueDate ?? null,
  }));
}
