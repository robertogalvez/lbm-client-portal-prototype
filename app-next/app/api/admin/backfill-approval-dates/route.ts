import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getActiveTasks } from '@/lib/clickup';
import { getTask, setDateField } from '@/lib/clickup-write';
import { CLIENT_APPROVAL } from '@/lib/clickup-write';

// POST /api/admin/backfill-approval-dates
//
// One-shot backfill: stamps "Date Approved by Client" on every task that is
// currently APPROVED but has no date yet. Uses dateUpdated as a proxy for
// the approval timestamp — it's the best signal we have for historical tasks.
// Rate-limited to 1 task per second to stay well within ClickUp's 100 req/min
// limit (each task needs two API calls: getTask + setDateField).
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

  const allTasks = await getActiveTasks(true);

  // Only tasks that are APPROVED but haven't had the date field set yet.
  const candidates = allTasks.filter(
    t => t.clientApproval === CLIENT_APPROVAL.approve && !t.approvedAt,
  );

  const results: { taskId: string; title: string; status: 'ok' | 'skipped' | 'error'; error?: string }[] = [];

  for (const task of candidates) {
    // Use dateUpdated as proxy — epoch ms string from ClickUp.
    const proxyMs = Number(task.dateUpdated);
    if (!Number.isFinite(proxyMs) || proxyMs <= 0) {
      results.push({ taskId: task.clickupTaskId, title: task.title, status: 'skipped' });
      continue;
    }

    try {
      const raw = await getTask(task.clickupTaskId);
      const wrote = await setDateField(raw, 'Date Approved by Client', proxyMs);
      results.push({
        taskId: task.clickupTaskId,
        title: task.title,
        status: wrote ? 'ok' : 'skipped',
      });
    } catch (e) {
      results.push({
        taskId: task.clickupTaskId,
        title: task.title,
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // 1 s between tasks — ClickUp allows 100 req/min, each task uses ~2 calls.
    await new Promise(r => setTimeout(r, 1000));
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors = results.filter(r => r.status === 'error').length;

  console.log('[backfill-approval-dates] done', { candidates: candidates.length, ok, skipped, errors });

  return NextResponse.json({ ok, skipped, errors, results });
}
