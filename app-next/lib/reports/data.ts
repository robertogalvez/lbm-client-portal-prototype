import { db } from '@/lib/db';
import { clients as clientsTable } from '@/lib/db/schema';
import { getTasksFromDB } from '@/lib/db/queries';
import { getTasksFromList, getTasksFromFolder, type MappedTask } from '@/lib/clickup';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Loads all cached tasks (DB, with live ClickUp fallback when the cache is
// empty) and hides Inactive clients — the same active set the dashboard shows.
export async function getActiveTasks(): Promise<MappedTask[]> {
  let tasks = await getTasksFromDB();
  if (tasks.length === 0) {
    const masterListId = process.env.CLICKUP_LIST_ID;
    const folderId = process.env.CLICKUP_FOLDER_ID;
    if (masterListId) tasks = await getTasksFromList(masterListId, false);
    else if (folderId) tasks = await getTasksFromFolder(folderId, false);
  }

  const clientStatusRows = await db
    .select({ name: clientsTable.name, clientStatus: clientsTable.clientStatus })
    .from(clientsTable)
    .catch(() => [] as { name: string; clientStatus: string | null }[]);
  const inactiveNames = new Set(
    clientStatusRows.filter(c => c.clientStatus === 'Inactive').map(c => norm(c.name)),
  );
  if (inactiveNames.size > 0) {
    tasks = tasks.filter(t => !t.clientName || !inactiveNames.has(norm(t.clientName)));
  }
  return tasks;
}
