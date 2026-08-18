import type { Config } from '@netlify/functions';

// Thin scheduled shim, same pattern as idle-review-reminder.mts: the actual
// "who gets texted" logic lives in the Next app route so it can use the
// typed libs (Drizzle, notify-client). Runs once a day — the route itself
// guards against double-texting a client in the same month via
// clients.lastReportNotifiedMonth, so a daily cadence just means a client
// hears about their new report within a day of the month turning over,
// without needing exact-midnight timing.

export default async function handler() {
  const base = process.env.URL ?? process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    return new Response(JSON.stringify({ skipped: true, reason: 'URL or CRON_SECRET not set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch(`${base}/api/reminders/new-report`, { method: 'POST', headers: { 'x-cron-secret': secret } });
  const body = await res.text();

  return new Response(JSON.stringify({ status: res.status, body }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '0 13 * * *', // daily at 13:00 UTC
};
