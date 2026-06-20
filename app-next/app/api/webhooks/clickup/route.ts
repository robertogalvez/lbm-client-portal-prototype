import { createHmac } from 'crypto';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { videoCache } from '@/lib/db/schema';
import { mapTask } from '@/lib/clickup';
import { eq } from 'drizzle-orm';

export async function POST(req: Request) {
  const secret = process.env.CLICKUP_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-signature');
  const hash = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (hash !== signature) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = JSON.parse(rawBody) as { event: string; task_id: string };
  const { event, task_id } = body;

  if (event === 'taskDeleted') {
    await db.delete(videoCache).where(eq(videoCache.clickupTaskId, task_id));
    return NextResponse.json({ ok: true });
  }

  // Fetch full task from ClickUp
  const res = await fetch(
    `https://api.clickup.com/api/v2/task/${task_id}?custom_fields=true`,
    {
      headers: {
        Authorization: process.env.CLICKUP_API_TOKEN ?? '',
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    }
  );

  if (!res.ok) {
    return new Response(`ClickUp API error: ${res.status}`, { status: 502 });
  }

  const task = await res.json();

  // Skip upsert if row has dirty = true
  const existing = await db
    .select({ dirty: videoCache.dirty })
    .from(videoCache)
    .where(eq(videoCache.clickupTaskId, task_id))
    .limit(1);

  if (existing[0]?.dirty) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const mapped = mapTask(task);

  await db
    .insert(videoCache)
    .values({
      clickupTaskId:     mapped.clickupTaskId,
      clientId:          mapped.clientOptionId,
      editorId:          null,
      assignedAmId:      null,
      title:             mapped.title,
      status:            mapped.status,
      clientApproval:    mapped.clientApproval,
      videoLevel:        mapped.videoLevel,
      caption:           mapped.caption,
      publishingStatus:  mapped.publishingStatus,
      frameioAssetId:    mapped.frameLink,
      vistasocialPostId: null,
      assignedAmName:    mapped.assignedAmName,
      editorName:        mapped.editorName,
      clientName:        mapped.clientName,
      qualityCheck:      mapped.qualityCheck,
      dateUpdated:       mapped.dateUpdated,
      dueDate:           mapped.dueDate,
      lastSyncedAt:      new Date(),
    })
    .onConflictDoUpdate({
      target: videoCache.clickupTaskId,
      set: {
        clientId:          mapped.clientOptionId,
        title:             mapped.title,
        status:            mapped.status,
        clientApproval:    mapped.clientApproval,
        videoLevel:        mapped.videoLevel,
        caption:           mapped.caption,
        publishingStatus:  mapped.publishingStatus,
        frameioAssetId:    mapped.frameLink,
        assignedAmName:    mapped.assignedAmName,
        editorName:        mapped.editorName,
        clientName:        mapped.clientName,
        qualityCheck:      mapped.qualityCheck,
        dateUpdated:       mapped.dateUpdated,
        dueDate:           mapped.dueDate,
        lastSyncedAt:      new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
