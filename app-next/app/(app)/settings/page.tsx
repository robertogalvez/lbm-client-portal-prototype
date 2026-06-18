import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq, ne } from 'drizzle-orm';
import { SettingsPageClient } from './SettingsPageClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

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
    })
    .from(authUsers)
    .where(ne(authUsers.role, 'client'))
    .orderBy(authUsers.createdAt);

  return <SettingsPageClient users={users} currentUserId={session.user.id} />;
}
