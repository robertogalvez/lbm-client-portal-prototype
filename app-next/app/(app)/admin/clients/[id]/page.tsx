import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { loadClientDetail } from '@/lib/client-detail';
import { ClientDetailView } from '@/components/clients/ClientDetailView';

export const revalidate = 60;

/**
 * Screen 3 lives at its own URL now. It used to be a component swapped in
 * over the Clients list, which meant the breadcrumb had nothing to link back
 * to and a detail view could not be shared or survive a reload. The `id` is
 * the contract period id — the same one the tables link with.
 */
export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');
  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  const { id } = await params;
  const data = await loadClientDetail(id);
  if (!data) notFound();

  return <ClientDetailView data={data} />;
}
