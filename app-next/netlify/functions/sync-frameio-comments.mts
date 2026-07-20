import type { Config } from '@netlify/functions';

// Thin scheduled shim: the sync logic lives in the Next app route
// (/api/frameio/comments-sync) so it can use the typed libs (Frame.io client,
// ClickUp write helpers, Drizzle). This function just pokes that route on a
// schedule, mirroring the capture-vistasocial-urls pattern.

export default async function handler() {
  const base = process.env.URL ?? process.env.DEPLOY_URL;
  const secret = process.env.CRON_SECRET;
  if (!base || !secret) {
    return new Response(JSON.stringify({ skipped: true, reason: 'URL or CRON_SECRET not set' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const res = await fetch(`${base}/api/frameio/comments-sync`, {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });

  return new Response(JSON.stringify({ status: res.status, body: await res.text() }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config: Config = {
  schedule: '*/5 * * * *', // every 5 minutes
};
