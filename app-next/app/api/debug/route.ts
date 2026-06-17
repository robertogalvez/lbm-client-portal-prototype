import { NextResponse } from 'next/server';

// Temporary debug endpoint — remove before going to production with real clients
export async function GET() {
  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;

  if (!token || !listId) {
    return NextResponse.json({ error: 'Missing env vars', token: !!token, listId: !!listId });
  }

  const url = `https://api.clickup.com/api/v2/list/${listId}/task?subtasks=true&include_closed=false&page=0`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: token },
      cache: 'no-store',
    });
    const data = await res.json();
    return NextResponse.json({
      status: res.status,
      listId,
      taskCount: data.tasks?.length ?? 0,
      firstTask: data.tasks?.[0] ? {
        id: data.tasks[0].id,
        name: data.tasks[0].name,
        status: data.tasks[0].status?.status,
      } : null,
      error: data.err ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) });
  }
}
