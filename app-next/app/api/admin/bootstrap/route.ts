import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// One-time endpoint to seed the first admin user.
// Protected by MIGRATE_SECRET — never exposed to clients.
export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { email, name } = await req.json() as { email?: string; name?: string };
  if (!email || !name) {
    return NextResponse.json({ error: 'email and name are required' }, { status: 400 });
  }

  const existing = await db
    .select({ id: authUsers.id, role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.email, email))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(authUsers)
      .set({ role: 'admin', emailVerified: true, name })
      .where(eq(authUsers.email, email));
    return NextResponse.json({ ok: true, action: 'promoted', email });
  }

  const id = crypto.randomUUID();
  await db.insert(authUsers).values({
    id,
    email,
    name,
    emailVerified: true,
    role: 'admin',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return NextResponse.json({ ok: true, action: 'created', email });
}
