import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getInvoices, isQuickBooksConfigured } from '@/lib/quickbooks';
import { InvoicesPageClient } from './InvoicesPageClient';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  const invoices = await getInvoices();

  return <InvoicesPageClient invoices={invoices} connected={isQuickBooksConfigured()} />;
}
