import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers, videoCache } from '@/lib/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';
import { CLIENT_APPROVAL, getTask, setDateField } from '@/lib/clickup-write';

// POST /api/admin/backfill-clickup-approval-dates?limit=20&offset=0
//
// Processes one batch of tasks per call to stay within Netlify's ~26s timeout.
// Call repeatedly, incrementing offset by limit, until remaining === 0.
// No sleep between tasks in a batch — 20 tasks × 2 ClickUp calls = 40 calls,
// well under the 100 req/min cap. The built-in 429 retry in cuRequest handles
// any burst spill. Idempotent — safe to re-run.
export async function POST(req: Request) {
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

  const url = new URL(req.url);
  const limit  = Math.min(Math.max(1, Number(url.searchParams.get('limit')  ?? 20)), 50);
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0));

  const allRows = await db
    .select({ clickupTaskId: videoCache.clickupTaskId, approvedAt: videoCache.approvedAt })
    .from(videoCache)
    .where(and(
      eq(videoCache.clientApproval, CLIENT_APPROVAL.approve),
      isNotNull(videoCache.approvedAt),
    ));

  const total     = allRows.length;
  const batch     = allRows.slice(offset, offset + limit);
  const remaining = Math.max(0, total - offset - batch.length);

  let ok = 0, skipped = 0, errors = 0;

  for (const row of batch) {
    const approvedAtMs = new Date(row.approvedAt!).getTime();
    if (!Number.isFinite(approvedAtMs) || approvedAtMs <= 0) { skipped++; continue; }

    try {
      const raw   = await getTask(row.clickupTaskId);
      const wrote = await setDateField(raw, 'Date Approved by Client', approvedAtMs);
      wrote ? ok++ : skipped++;
    } catch {
      errors++;
    }
  }

  console.log('[backfill-clickup-approval-dates]', { offset, limit, ok, skipped, errors, remaining });

  return NextResponse.json({ ok, skipped, errors, offset, limit, total, remaining });
}
