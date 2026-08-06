import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pendingDecisions } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

// DELETE /api/client/approve/undo  { decisionId }
// Cancels a pending decision before it executes. Only the session user who
// created the decision may undo it.
export async function DELETE(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { decisionId } = await req.json() as { decisionId?: string };
  if (!decisionId) return NextResponse.json({ error: 'Missing decisionId' }, { status: 400 });

  const result = await db
    .delete(pendingDecisions)
    .where(and(
      eq(pendingDecisions.id, decisionId),
      eq(pendingDecisions.userId, session.user.id),
      eq(pendingDecisions.executed, false),
    ))
    .returning({ id: pendingDecisions.id });

  if (result.length === 0) {
    return NextResponse.json({ error: 'Decision not found, already executed, or not yours' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, undone: decisionId });
}
