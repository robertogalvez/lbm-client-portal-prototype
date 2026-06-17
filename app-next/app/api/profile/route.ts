import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rows = await db
    .select({ amName: authUsers.amName })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  return NextResponse.json({ amName: rows[0]?.amName ?? null });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const amName: string = body.amName ?? '';

  await db
    .update(authUsers)
    .set({ amName })
    .where(eq(authUsers.id, session.user.id));

  return NextResponse.json({ ok: true });
}
