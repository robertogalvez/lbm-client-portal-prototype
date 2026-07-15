import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq, ne } from 'drizzle-orm';
import { getConnectionStatus } from '@/lib/frameio';
import { SettingsPageClient } from './SettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ frameio?: string; reason?: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const sp = await searchParams;

  const [caller] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (!caller || caller.role !== 'admin') redirect('/dashboard');

  const users = await db
    .select({
      id: authUsers.id,
      name: authUsers.name,
      email: authUsers.email,
      role: authUsers.role,
      emailVerified: authUsers.emailVerified,
      createdAt: authUsers.createdAt,
      isAlsoClient: authUsers.isAlsoClient,
      clientName: authUsers.clientName,
    })
    .from(authUsers)
    .where(ne(authUsers.role, 'client'))
    .orderBy(authUsers.createdAt);

  const conn = await getConnectionStatus().catch(() => null);
  const frameio = {
    connected: conn?.connected ?? false,
    mode: conn?.mode ?? 'disconnected',
    needsReauth: conn?.needsReauth ?? true,
    daysUntilReauth: conn?.daysUntilReauth ?? null,
    reauthDeadline: conn?.reauthDeadline ? conn.reauthDeadline.toISOString() : null,
    banner: sp.frameio ?? null,
    bannerReason: sp.reason ?? null,
  };

  return <SettingsPageClient users={users} currentUserId={session.user.id} frameio={frameio} />;
}
