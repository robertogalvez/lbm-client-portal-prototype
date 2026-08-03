import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { cleanSocialLinks } from '@/lib/socialLinks';

// Separate from the general PUT /api/admin/clients/[id] route so callers
// that only know about social links (e.g. the Client Detail edit panel)
// never risk clobbering portal settings they don't have in scope.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const caller = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (caller[0]?.role === 'client') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const cleaned = cleanSocialLinks(body.socialLinks);

  const [updated] = await db.update(clients).set({ socialLinks: cleaned }).where(eq(clients.id, id)).returning({ id: clients.id, socialLinks: clients.socialLinks });
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true, socialLinks: updated.socialLinks });
}
