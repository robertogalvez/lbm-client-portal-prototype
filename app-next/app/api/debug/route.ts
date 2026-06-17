import { NextResponse } from 'next/server';

// Temporary debug endpoint — remove before going to production with real clients
export async function GET() {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;

  if (!token) {
    return NextResponse.json({ error: 'Missing CLICKUP_API_TOKEN' });
  }

  const headers = { Authorization: token };
  const results: Record<string, unknown> = { listId, folderId };

  // Try list endpoint
  if (listId) {
    try {
      const res = await fetch(
        `https://api.clickup.com/api/v2/list/${listId}/task?subtasks=true&include_closed=true&page=0`,
        { headers, cache: 'no-store' }
      );
      const data = await res.json();
      results.list = {
        status: res.status,
        taskCount: data.tasks?.length ?? 0,
        firstTask: data.tasks?.[0] ? { id: data.tasks[0].id, name: data.tasks[0].name, status: data.tasks[0].status?.status } : null,
        error: data.err ?? null,
      };
    } catch (e) { results.listError = String(e); }
  }

  // Try folder endpoint — get all lists in the folder
  if (folderId) {
    try {
      const res = await fetch(
        `https://api.clickup.com/api/v2/folder/${folderId}/list`,
        { headers, cache: 'no-store' }
      );
      const data = await res.json();
      results.folder = {
        status: res.status,
        lists: data.lists?.map((l: { id: string; name: string; task_count: number }) => ({ id: l.id, name: l.name, taskCount: l.task_count })) ?? [],
        error: data.err ?? null,
      };
    } catch (e) { results.folderError = String(e); }
  }

  return NextResponse.json(results);
}
