import type { Config } from '@netlify/functions';

// Thin scheduled shim: the capture logic lives in the Next app route
// (/api/publish/capture) so it can use the typed libs (Vista Social client,
// distribute, Drizzle). This function just pokes that route on a schedule.
// Runs every 15 minutes to stay well under Vista Social's abuse threshold.

export default async function handler() {
  const base = process.env.URL ?? process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    return new Response(JSON.stringify({ skipped: true, reason: 'URL or CRON_SECRET not set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const call = async (path: string) => {
    const res = await fetch(`${base}${path}`, { method: 'POST', headers: { 'x-cron-secret': secret } });
    return { path, status: res.status, body: await res.text() };
  };

  // Reconcile first (publish any Ready-to-Publish tasks a webhook may have missed),
  // then capture live Instagram URLs, then check Frame.io auth expiry.
  const reconcile = await call('/api/publish/reconcile');
  const capture = await call('/api/publish/capture');
  const frameioRenew = await call('/api/frameio/oauth/renew-check');

  return new Response(JSON.stringify({ reconcile, capture, frameioRenew }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '*/15 * * * *', // every 15 minutes
};
