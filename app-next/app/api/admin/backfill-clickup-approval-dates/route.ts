import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, videoCache } from '@/lib/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { CLIENT_APPROVAL } from '@/lib/clickup-write';
import { getTask, setDateField } from '@/lib/clickup-write';

// POST /api/admin/backfill-clickup-approval-dates
//
// Reads approved_at from Neon (populated by /api/admin/backfill-approval-dates)
// and writes those timestamps into the ClickUp "Date Approved by Client" field.
// Rate-limited to 1 task per second (~2 ClickUp calls each) to stay under the
// 100 req/min cap. Idempotent — safe to re-run.
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

  const rows = await db
    .select({ clickupTaskId: videoCache.clickupTaskId, approvedAt: videoCache.approvedAt })
    .from(videoCache)
    .where(and(
      eq(videoCache.clientApproval, CLIENT_APPROVAL.approve),
      isNotNull(videoCache.approvedAt),
    ));

  const results: { taskId: string; status: 'ok' | 'skipped' | 'error'; error?: string }[] = [];

  for (const row of rows) {
    const approvedAtMs = new Date(row.approvedAt!).getTime();
    if (!Number.isFinite(approvedAtMs) || approvedAtMs <= 0) {
      results.push({ taskId: row.clickupTaskId, status: 'skipped' });
      continue;
    }

    try {
      const raw = await getTask(row.clickupTaskId);
      const wrote = await setDateField(raw, 'Date Approved by Client', approvedAtMs);
      results.push({ taskId: row.clickupTaskId, status: wrote ? 'ok' : 'skipped' });
    } catch (e) {
      results.push({
        taskId: row.clickupTaskId,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  const ok      = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors  = results.filter(r => r.status === 'error').length;

  console.log('[backfill-clickup-approval-dates] done', { total: rows.length, ok, skipped, errors });

  return NextResponse.json({ ok, skipped, errors, total: rows.length });
}
