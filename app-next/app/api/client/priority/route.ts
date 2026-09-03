// POST /api/client/priority
// Body: { order: string[] }  — the client's full desired order of their
// in-production videos, top = highest priority. rank = index + 1.
//
// Saves the exact rank in video_priorities (the only place the exact order
// lives — ClickUp has no such concept) and translates each rank into
// ClickUp's native Priority field (see lib/priority.ts). Notifies the
// assigned AM only when the #1 video actually changes.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, videoPriorities } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getViewAsClient } from '@/lib/view-as';
import { getTasksFromList } from '@/lib/clickup';
import { setTaskPriority } from '@/lib/clickup-write';
import { rankToClickUpPriority } from '@/lib/priority';
import { notifyAmOfPriorityChange } from '@/lib/notify-am';

export async function POST(req: Request) {
  try {
    return await handlePost(req);
  } catch (e) {
    console.error('[client/priority] unhandled error', e);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

async function handlePost(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName, isAlsoClient: authUsers.isAlsoClient })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let effectiveClientName = userRow.clientName;
  const isStaff = userRow.role === 'admin' || userRow.role === 'account_manager';
  if (isStaff) {
    const viewAsClient = await getViewAsClient();
    if (viewAsClient) effectiveClientName = viewAsClient.name;
  }

  if (!effectiveClientName) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (userRow.role !== 'client' && !isStaff && !userRow.isAlsoClient) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json() as { order?: string[] };
  const order = body.order;
  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'Missing or empty order' }, { status: 400 });
  }

  // Tenant isolation: every id in the submitted order must actually belong
  // to this client — cross-check against a fresh ClickUp fetch rather than
  // trusting the client-submitted list wholesale.
  const allTasks = await getTasksFromList(process.env.CLICKUP_LIST_ID!, false);
  const clientTasks = allTasks.filter(t => t.clientName === effectiveClientName);
  const clientTaskById = new Map(clientTasks.map(t => [t.clickupTaskId, t]));
  for (const taskId of order) {
    if (!clientTaskById.has(taskId)) {
      return NextResponse.json({ error: `Task ${taskId} does not belong to this client` }, { status: 403 });
    }
  }

  const previousTop = await db
    .select({ clickupTaskId: videoPriorities.clickupTaskId })
    .from(videoPriorities)
    .where(and(eq(videoPriorities.clientName, effectiveClientName), eq(videoPriorities.rank, 1)))
    .limit(1);
  const previousTopId = previousTop[0]?.clickupTaskId ?? null;

  await Promise.all(order.map((taskId, i) => {
    const rank = i + 1;
    return Promise.all([
      db.insert(videoPriorities).values({ clickupTaskId: taskId, clientName: effectiveClientName!, rank, updatedAt: new Date() })
        .onConflictDoUpdate({ target: videoPriorities.clickupTaskId, set: { rank, clientName: effectiveClientName!, updatedAt: new Date() } }),
      setTaskPriority(taskId, rankToClickUpPriority(rank)).catch(() => { /* non-fatal — DB order is still saved */ }),
    ]);
  }));

  const newTopId = order[0];
  if (newTopId !== previousTopId) {
    const topTask = clientTaskById.get(newTopId);
    if (topTask) {
      notifyAmOfPriorityChange({
        assignedAmName: topTask.assignedAmName,
        taskId: newTopId,
        videoTitle: topTask.clientFacingTitle || topTask.title,
        clientName: effectiveClientName,
      }).catch(() => {});
    }
  }

  return NextResponse.json({ ok: true, order });
}
