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
      frameioProjectId: r.frameioProjectId,
      clientStatus:   r.clientStatus,
      monthlyQuota:   r.monthlyQuota,
      lastSyncedAt:   new Date(),
    };

    // Capture existing client data (branding config and name for cascading renames)
    const [existingClient] = await db.select({ name: clients.name, brandingConfig: clients.brandingConfig })
      .from(clients)
      .where(eq(clients.clickupTaskId, r.clickupTaskId))
      .limit(1);

    const existingConfig = (existingClient?.brandingConfig as Record<string, unknown>) ?? {};
    if (r.vistaSocialProfileIds) {
      existingConfig.vistaSocialProfileIds = r.vistaSocialProfileIds;
    }
    const brandingConfig = Object.keys(existingConfig).length > 0 ? existingConfig : null;
    const rowWithBranding = { ...row, brandingConfig };

    // Reconcile hand-created rows (pre-dating ClickUp sync) onto the real task ID by name match.
    const [legacy] = await db.select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(sqlOp`lower(${clients.name}) = lower(${r.name})`, ne(clients.clickupTaskId, r.clickupTaskId)))
      .limit(1);

    if (legacy) {
      await db.update(clients).set(rowWithBranding).where(eq(clients.id, legacy.id));
    } else {
      await db.insert(clients).values(rowWithBranding).onConflictDoUpdate({ target: clients.clickupTaskId, set: rowWithBranding });
    }

    // Portal users link to a client by name string (auth_user.client_name); when
    // the ClickUp-owned name changes, cascade it so the link isn't orphaned.
    const prevName = existingClient?.name ?? legacy?.name;
    if (prevName && prevName !== r.name) {
      await db.update(authUsers).set({ clientName: r.name }).where(eq(authUsers.clientName, prevName));
    }
    synced++;
  }

  return NextResponse.json({ ok: true, synced, skipped: skipped.length, skippedNames: skipped });
}
