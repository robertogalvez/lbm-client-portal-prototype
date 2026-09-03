import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { requireAdmin } from '@/lib/require-admin';

// Minimal {id, name} roster for the joint-client picker in
// ContractPeriodForm — kept separate from GET /api/admin/clients (which
// loads full period/line-item/portal-user data per client) since the picker
// only ever needs id+name, and fetching it doesn't need to be tied to
// whichever client's drawer happens to be open.
export async function GET() {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name);
  return NextResponse.json(rows);
}
