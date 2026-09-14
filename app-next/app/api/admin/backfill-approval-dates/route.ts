import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, videoCache } from '@/lib/db/schema';
import { eq, and, isNull } from 'drizzle-orm';
import { CLIENT_APPROVAL } from '@/lib/clickup-write';

// POST /api/admin/backfill-approval-dates
//
// One-shot backfill: stamps video_cache.approved_at on every row that is
// already APPROVED but has no date yet. Uses dateUpdated as a proxy for
// the approval timestamp — it's the best signal we have for historical tasks
// that predate this column. Idempotent: rows that already have approved_at
// set are skipped by the WHERE clause.
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [caller] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);

  if (!caller || caller.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch only the rows that need backfilling.
  const candidates = await db
    .select({ clickupTaskId: videoCache.clickupTaskId, dateUpdated: videoCache.dateUpdated })
    .from(videoCache)
    .where(and(
      eq(videoCache.clientApproval, CLIENT_APPROVAL.approve),
      isNull(videoCache.approvedAt),
    ));

  let ok = 0;
  let skipped = 0;

  for (const row of candidates) {
    const proxyMs = Number(row.dateUpdated);
    if (!Number.isFinite(proxyMs) || proxyMs <= 0) {
      skipped++;
      continue;
    }
    const approvedAt = new Date(proxyMs).toISOString();
    await db
      .update(videoCache)
      .set({ approvedAt })
      .where(eq(videoCache.clickupTaskId, row.clickupTaskId));
    ok++;
  }

  console.log('[backfill-approval-dates] done', { candidates: candidates.length, ok, skipped });

  return NextResponse.json({ ok, skipped, total: candidates.length });
}
