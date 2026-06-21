import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const token = process.env.CLICKUP_API_TOKEN;
  const listId = process.env.CLICKUP_LIST_ID;
  const folderId = process.env.CLICKUP_FOLDER_ID;

  if (!token) return NextResponse.json({ error: 'CLICKUP_API_TOKEN not set' }, { status: 500 });

  // Get custom fields from the list
  const targetListId = listId ?? (folderId ? await getFirstListInFolder(folderId, token) : null);
  if (!targetListId) return NextResponse.json({ error: 'No list configured' }, { status: 500 });

  const res = await fetch(`https://api.clickup.com/api/v2/list/${targetListId}/field`, {
    headers: { Authorization: token },
    cache: 'no-store',
  });
  if (!res.ok) return NextResponse.json({ error: 'ClickUp API error' }, { status: 502 });

  const data = await res.json();
  const fields: { name: string; type_config?: { options?: { id: string; name: string }[] } }[] = data.fields ?? [];
  const clientField = fields.find(f => f.name === 'Client Name (AM)');
  const options = clientField?.type_config?.options ?? [];

  return NextResponse.json(options.map(o => ({ id: o.id, name: o.name })));
}

async function getFirstListInFolder(folderId: string, token: string): Promise<string | null> {
  const res = await fetch(`https://api.clickup.com/api/v2/folder/${folderId}/list`, { headers: { Authorization: token } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.lists?.[0]?.id ?? null;
}
