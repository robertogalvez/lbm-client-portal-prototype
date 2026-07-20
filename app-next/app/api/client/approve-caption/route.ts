import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getViewAsClient } from '@/lib/view-as';
import { resolveTaskClientName, type ClickUpTask } from '@/lib/clickup';

const BASE = 'https://api.clickup.com/api/v2';

function clickupHeaders() {
  return {
    Authorization: process.env.CLICKUP_API_TOKEN ?? '',
    'Content-Type': 'application/json',
  };
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ role: authUsers.role, clientName: authUsers.clientName })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  const userRow = rows[0];
  if (!userRow) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Support both actual clients and admins viewing as clients
  let effectiveClientName = userRow.clientName;
  const isStaff = userRow.role === 'admin' || userRow.role === 'account_manager';
  if (isStaff) {
    const viewAsClient = await getViewAsClient();
    if (viewAsClient) {
      effectiveClientName = viewAsClient.name;
    }
  }

  if (!effectiveClientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (userRow.role !== 'client' && !isStaff) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { taskId, action } = body as { taskId?: string; action?: 'approve' | 'changes' };
  if (!taskId || !action) return NextResponse.json({ error: 'Missing taskId or action' }, { status: 400 });

  const taskRes = await fetch(`${BASE}/task/${taskId}`, { headers: clickupHeaders() });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json() as ClickUpTask;

  // Tenant isolation: never let a client mutate a task that isn't theirs.
  if (resolveTaskClientName(task) !== effectiveClientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const captionApprovalField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'CAPTION APPROVAL');
  if (!captionApprovalField) return NextResponse.json({ error: 'CAPTION APPROVAL field not found on task' }, { status: 422 });

  const options: { id: string; name: string }[] = captionApprovalField.type_config?.options ?? [];
  const targetName = action === 'approve' ? 'Approved' : 'Changes Requested';
  const optionIndex = options.findIndex((o: { name: string }) =>
    o.name.toLowerCase().includes(action === 'approve' ? 'approv' : 'change')
  );

  if (optionIndex === -1) {
    return NextResponse.json({
      error: `Could not find "${targetName}" option in CAPTION APPROVAL field`,
      available: options.map(o => o.name),
    }, { status: 422 });
  }

  const updateRes = await fetch(`${BASE}/task/${taskId}/field/${captionApprovalField.id}`, {
    method: 'POST',
    headers: clickupHeaders(),
    body: JSON.stringify({ value: optionIndex }),
  });

  if (!updateRes.ok) {
    const err = await updateRes.text();
    return NextResponse.json({ error: `ClickUp update failed: ${err}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, action, optionName: options[optionIndex]?.name });
}
