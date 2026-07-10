import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq, ne, and, sql as sqlOp } from 'drizzle-orm';
import { getMasterClientRecords } from '@/lib/clickup';

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (!process.env.CLICKUP_CLIENTS_LIST_ID) {
    return NextResponse.json({ error: 'CLICKUP_CLIENTS_LIST_ID not set' }, { status: 500 });
  }

  const { records, skipped } = await getMasterClientRecords();

  let synced = 0;
  for (const r of records) {
    const row = {
      name:           r.name,
      clickupTaskId:  r.clickupTaskId,
      contactName:    r.contactName,
      contactEmail:   r.contactEmail,
      whatsappNumber: r.whatsappNumber,
      clientStatus:   r.clientStatus,
      monthlyQuota:   r.monthlyQuota,
      lastSyncedAt:   new Date(),
    };

    // Reconcile hand-created rows (pre-dating ClickUp sync) onto the real task ID by name match.
    const [legacy] = await db.select({ id: clients.id })
      .from(clients)
      .where(and(sqlOp`lower(${clients.name}) = lower(${r.name})`, ne(clients.clickupTaskId, r.clickupTaskId)))
      .limit(1);

    if (legacy) {
      await db.update(clients).set(row).where(eq(clients.id, legacy.id));
    } else {
      await db.insert(clients).values(row).onConflictDoUpdate({ target: clients.clickupTaskId, set: row });
    }
    synced++;
  }

  return NextResponse.json({ ok: true, synced, skipped: skipped.length, skippedNames: skipped });
}
