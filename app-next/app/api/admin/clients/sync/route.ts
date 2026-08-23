import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq, ne, and, sql as sqlOp } from 'drizzle-orm';
import { getMasterClientRecords, type MasterClientRecord } from '@/lib/clickup';

// Adopts an existing portal account matching the ClickUp contact email as
// this client's primary contact if one already exists (only if it's already
// a 'client' account for this same client — never repurposes an unrelated
// admin/AM account or another client's account), otherwise creates a new,
// not-yet-invited one. Either way, links it via clients.primaryContactUserId.
async function linkOrCreatePrimaryContact(clientId: string, r: MasterClientRecord): Promise<void> {
  const [existingUser] = await db.select({ id: authUsers.id, role: authUsers.role, clientName: authUsers.clientName })
    .from(authUsers)
    .where(eq(authUsers.email, r.contactEmail!))
    .limit(1);

  let userId: string;
  if (existingUser && existingUser.role === 'client' && (!existingUser.clientName || existingUser.clientName === r.name)) {
    userId = existingUser.id;
    await db.update(authUsers).set({ clientName: r.name, name: r.contactName || r.name }).where(eq(authUsers.id, userId));
  } else if (existingUser) {
    // Email belongs to an unrelated account (different role, or a different
    // client) — don't touch it or create a colliding duplicate.
    return;
  } else {
    userId = crypto.randomUUID();
    await db.insert(authUsers).values({
      id: userId,
      email: r.contactEmail!,
      name: r.contactName || r.name,
      emailVerified: false,
      role: 'client',
      clientName: r.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
  await db.update(clients).set({ primaryContactUserId: userId }).where(eq(clients.id, clientId));
}

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
      clickupClientOptionId: r.clickupClientOptionId,
      lastSyncedAt:   new Date(),
    };

    // Capture existing client data (branding config, name for cascading
    // renames, and the linked primary-contact portal account, if any)
    const [existingClient] = await db.select({ name: clients.name, brandingConfig: clients.brandingConfig, primaryContactUserId: clients.primaryContactUserId })
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
    const [legacy] = await db.select({ id: clients.id, name: clients.name, primaryContactUserId: clients.primaryContactUserId })
      .from(clients)
      .where(and(sqlOp`lower(${clients.name}) = lower(${r.name})`, ne(clients.clickupTaskId, r.clickupTaskId)))
      .limit(1);

    let clientId: string;
    if (legacy) {
      await db.update(clients).set(rowWithBranding).where(eq(clients.id, legacy.id));
      clientId = legacy.id;
    } else {
      const [upserted] = await db.insert(clients).values(rowWithBranding)
        .onConflictDoUpdate({ target: clients.clickupTaskId, set: rowWithBranding })
        .returning({ id: clients.id });
      clientId = upserted.id;
    }

    // Portal users link to a client by name string (auth_user.client_name); when
    // the ClickUp-owned name changes, cascade it so the link isn't orphaned.
    const prevName = existingClient?.name ?? legacy?.name;
    if (prevName && prevName !== r.name) {
      await db.update(authUsers).set({ clientName: r.name }).where(eq(authUsers.clientName, prevName));
    }

    // ClickUp is the source of truth for who the primary contact is: ensure a
    // portal account exists for their Contact Email Address, and keep it in
    // sync going forward. Never auto-invites — an admin sends/resends that
    // from the Clients page once they're ready (the account already shows up
    // there as "Pending" via the existing invite UI).
    const primaryContactUserId = existingClient?.primaryContactUserId ?? legacy?.primaryContactUserId ?? null;
    if (r.contactEmail) {
      if (primaryContactUserId) {
        const [primary] = await db.select({ id: authUsers.id, email: authUsers.email })
          .from(authUsers)
          .where(eq(authUsers.id, primaryContactUserId))
          .limit(1);
        if (primary && primary.email.toLowerCase() !== r.contactEmail.toLowerCase()) {
          const emailTaken = await db.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, r.contactEmail)).limit(1);
          if (emailTaken.length === 0) {
            await db.update(authUsers).set({ email: r.contactEmail, name: r.contactName || r.name, updatedAt: new Date() }).where(eq(authUsers.id, primary.id));
          }
          // else: another account already owns that address — leave the
          // primary link as-is rather than risk a unique-constraint error.
        } else if (primary) {
          // Same email — just keep the display name current.
          await db.update(authUsers).set({ name: r.contactName || r.name }).where(eq(authUsers.id, primary.id));
        }
        // If `primary` is missing entirely (row was deleted), fall through
        // and treat this client as having no primary contact yet below.
        if (!primary) {
          await linkOrCreatePrimaryContact(clientId, r);
        }
      } else {
        await linkOrCreatePrimaryContact(clientId, r);
      }
    }

    synced++;
  }

  return NextResponse.json({ ok: true, synced, skipped: skipped.length, skippedNames: skipped });
}
