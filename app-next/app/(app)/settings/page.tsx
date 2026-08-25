import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq, ne } from 'drizzle-orm';
import { getConnectionStatus } from '@/lib/frameio';
import { getConnectionStatus as getQuickBooksStatus } from '@/lib/quickbooks';
import { isSmsConfigured } from '@/lib/sms';
import { SettingsPageClient } from './SettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ frameio?: string; quickbooks?: string; reason?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const sp = await searchParams;

  const [caller] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (!caller || caller.role !== 'admin') redirect('/dashboard');

  // The user list and the Frame.io connection check are independent, and the
  // latter goes out over the network — no reason to wait on it in series.
  // The catch stays per-promise so a Frame.io failure does not reject both.
  const [users, conn, qbo] = await Promise.all([
    db
      .select({
        id: authUsers.id,
        name: authUsers.name,
        email: authUsers.email,
        role: authUsers.role,
        emailVerified: authUsers.emailVerified,
        createdAt: authUsers.createdAt,
        isAlsoClient: authUsers.isAlsoClient,
        clientName: authUsers.clientName,
        notifyMethod: authUsers.notifyMethod,
        phone: authUsers.phone,
      })
      .from(authUsers)
      .where(ne(authUsers.role, 'client'))
      .orderBy(authUsers.createdAt),
    getConnectionStatus().catch(() => null),
    getQuickBooksStatus().catch(() => null),
  ]);
  const frameio = {
    connected: conn?.connected ?? false,
    mode: conn?.mode ?? 'disconnected',
    needsReauth: conn?.needsReauth ?? true,
    daysUntilReauth: conn?.daysUntilReauth ?? null,
    reauthDeadline: conn?.reauthDeadline ? conn.reauthDeadline.toISOString() : null,
    banner: sp.frameio ?? null,
    bannerReason: sp.reason ?? null,
  };

  const quickbooks = {
    connected: qbo?.connected ?? false,
    configured: qbo?.configured ?? false,
    needsReauth: qbo?.needsReauth ?? true,
    daysUntilReauth: qbo?.daysUntilReauth ?? null,
    realmId: qbo?.realmId ?? null,
    banner: sp.quickbooks ?? null,
    bannerReason: sp.reason ?? null,
  };

  return <SettingsPageClient users={users} currentUserId={session.user.id} frameio={frameio} quickbooks={quickbooks} smsConfigured={isSmsConfigured()} />;
}
