// Publish reconcile pass — the robust backup trigger. ClickUp webhooks aren't
// guaranteed, so this scans the list for tasks flagged "Ready to Publish?" that
// haven't been published and runs the native publish pipeline on each. Invoked
// by the scheduled Netlify function or manually with the cron secret.

import { NextResponse } from 'next/server';
import { getPublishableTaskIds } from '@/lib/clickup';
import { publishVideo } from '@/lib/publish/publish-video';

const MAX_PER_RUN = 10;

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const listId = process.env.CLICKUP_LIST_ID;
  if (!listId) return NextResponse.json({ error: 'CLICKUP_LIST_ID not set' }, { status: 503 });

  const ids = (await getPublishableTaskIds(listId)).slice(0, MAX_PER_RUN);
  const results: Record<string, string> = {};
  for (const id of ids) {
    try {
      const outcome = await publishVideo(id);
      results[id] = outcome.status;
    } catch (e) {
      results[id] = `exception: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  return NextResponse.json({ ok: true, considered: ids.length, results });
}
