import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

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
  if (!userRow || userRow.role !== 'client' || !userRow.clientName) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { taskId, action } = body as { taskId?: string; action?: 'approve' | 'changes' };
  if (!taskId || !action) return NextResponse.json({ error: 'Missing taskId or action' }, { status: 400 });

  // Fetch the task to get the CLIENT APPROVAL field ID and options
  const taskRes = await fetch(`${BASE}/task/${taskId}`, { headers: clickupHeaders() });
  if (!taskRes.ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const task = await taskRes.json();

  const approvalField = (task.custom_fields ?? []).find((f: { name: string }) => f.name === 'CLIENT APPROVAL');

  if (!approvalField) return NextResponse.json({ error: 'CLIENT APPROVAL field not found on task' }, { status: 422 });

  const options: { id: string; name: string }[] = approvalField.type_config?.options ?? [];
  const targetName = action === 'approve' ? 'Approved' : 'Changes Requested';
  const optionIndex = options.findIndex((o: { name: string }) =>
    o.name.toLowerCase().includes(action === 'approve' ? 'approv' : 'change')
  );

  if (optionIndex === -1) {
    return NextResponse.json({
      error: `Could not find "${targetName}" option in CLIENT APPROVAL field`,
      available: options.map(o => o.name),
    }, { status: 422 });
  }

  const updateRes = await fetch(`${BASE}/task/${taskId}/field/${approvalField.id}`, {
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
