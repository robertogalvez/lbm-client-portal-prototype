import { getTasksFromFolder, getTasksFromList, MappedTask } from '@/lib/clickup';
import { getTasksFromDB } from '@/lib/db/queries';

/**
 * The dashboard's task source: the local video_cache mirror, falling back to
 * a live ClickUp fetch when the cache is empty (e.g. before the first sync
 * has run). Shared between the dashboard page and the client-detail API
 * route so both read the exact same fallback logic.
 */
export async function getDashboardTasks(): Promise<{ tasks: MappedTask[]; error: string | null }> {
  const masterListId = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;
  try {
    let tasks = await getTasksFromDB();
    if (tasks.length === 0) {
      if (masterListId) {
        tasks = await getTasksFromList(masterListId, false);
      } else if (folderId) {
        tasks = await getTasksFromFolder(folderId, false);
      }
    }
    return { tasks, error: null };
  } catch (e) {
    return { tasks: [], error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
