// Monthly "your report is ready" SMS — pings every client with the Report
// tab enabled and SMS notifications on, once per calendar month. Invoked by
// the scheduled Netlify function (monthly, see
// netlify/functions/new-report-reminder.mts) or manually with the cron
// secret, same shape as /api/reminders/idle-review.
//
// The report itself (components/client/MonthlyReport.tsx) is computed live
// from tasks + contract data — there's no separate "generate the report"
// step — so "ready" here just means "a new calendar month has started for
// this client's report." clients.lastReportNotifiedMonth guards against
// texting the same client twice for the same month.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { and, eq, ne, or, isNull } from 'drizzle-orm';
import { notifyClientReportReady } from '@/lib/notify-client';

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const month = currentMonth();
  const portalOrigin = new URL(req.url).origin;

  const candidates = await db
    .select({ name: clients.name })
    .from(clients)
    .where(and(
      eq(clients.showReport, true),
      eq(clients.notifySms, true),
      or(isNull(clients.lastReportNotifiedMonth), ne(clients.lastReportNotifiedMonth, month)),
    ));

  const results: Record<string, string> = {};
  for (const c of candidates) {
    await notifyClientReportReady({ clientName: c.name, portalOrigin });
    await db.update(clients).set({ lastReportNotifiedMonth: month }).where(eq(clients.name, c.name));
    results[c.name] = 'notified';
  }

  return NextResponse.json({ ok: true, month, considered: candidates.length, results });
}
