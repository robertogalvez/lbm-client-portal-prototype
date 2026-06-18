import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const role = (session.user as { role?: string }).role ?? 'account_manager';

  if (role === 'client') redirect('/client');

  // ceo, account_manager, editor all land on the internal dashboard
  redirect('/dashboard');
}
