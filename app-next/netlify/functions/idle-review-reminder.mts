import type { Config } from '@netlify/functions';

// Thin scheduled shim: the idle-review scan lives in the Next app route
// (/api/reminders/idle-review) so it can use the typed libs (Drizzle,
// notify-am). This function just pokes that route on a schedule. Runs
// hourly — plenty of granularity for a 24h threshold.

export default async function handler() {
  const base = process.env.URL ?? process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    return new Response(JSON.stringify({ skipped: true, reason: 'URL or CRON_SECRET not set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch(`${base}/api/reminders/idle-review`, { method: 'POST', headers: { 'x-cron-secret': secret } });
  const body = await res.text();

  return new Response(JSON.stringify({ status: res.status, body }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '0 * * * *', // hourly
};
