import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { clients, type Client } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const VIEW_AS_COOKIE = 'view_as_client_id';
export const VIEW_AS_MAX_AGE = 60 * 60 * 4; // 4 hours

// Only admins/AMs viewing a portal on someone else's behalf should ever resolve
// a target here — callers must gate this behind a role check first, since a
// client-role user could otherwise plant this cookie themselves via devtools.
export async function getViewAsClient(): Promise<Client | null> {
  const store = await cookies();
  const id = store.get(VIEW_AS_COOKIE)?.value;
  if (!id) return null;
  const [client] = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return client ?? null;
}
