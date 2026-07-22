// Diagnostics for the publishing pipeline (cron-secret protected). Reports
// Frame.io auth state, Vista Social config, and — given ?taskId= — the
// resolved trigger/validation fields and (with ?probe=1) a live Frame.io asset
// resolution. Never returns secret values.
//
// Mostly read-only, with ONE explicit exception: &writeTestComment=N actually
// posts N real test comments, one after another, to the task's Frame.io file
// (to diagnose comment-creation failures the same way ?probe=1 diagnoses
// asset-resolution ones — including failures that only show up on the 2nd+
// comment, not the 1st) — opt-in only, never fires without that flag.
//
//   GET /api/publish/debug            (header x-cron-secret)
//   GET /api/publish/debug?taskId=... [&probe=1] [&writeTestComment=1|2|...]

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import * as clickup from '@/lib/clickup-write';
import * as frameio from '@/lib/frameio';
import * as vista from '@/lib/vistasocial';

function optionName(f: clickup.ClickUpFieldLite | undefined): string | null {
  if (!f || typeof f.value !== 'number') return null;
  return f.type_config?.options?.[f.value]?.name ?? null;
}
function textValue(f: clickup.ClickUpFieldLite | undefined): string | null {
  return typeof f?.value === 'string' && f.value.trim() ? f.value : null;
}
function boolValue(f: clickup.ClickUpFieldLite | undefined): boolean {
  const v = f?.value;
  return v === true || v === 'true' || v === 1 || v === '1';
}

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const taskId = url.searchParams.get('taskId');
  const probe = url.searchParams.get('probe') === '1';
  const writeTestCommentCount = Math.max(0, Math.min(5, parseInt(url.searchParams.get('writeTestComment') ?? '0', 10) || 0));
  const shareId = url.searchParams.get('shareId');
  const shortLink = url.searchParams.get('shortLink');

  const report: Record<string, unknown> = {
    env: {
      clickupTokenSet: !!process.env.CLICKUP_API_TOKEN,
      clickupListId: process.env.CLICKUP_LIST_ID ?? null,
      databaseUrlSet: !!process.env.DATABASE_URL,
      cronSecretSet: !!process.env.CRON_SECRET,
    },
    frameioAuth: await frameio.authDiagnostics(),
    vista: {
      configured: vista.isConfigured(),
      tokenSet: !!process.env.VISTASOCIAL_API_TOKEN,
      base: process.env.VISTASOCIAL_API_BASE || '(default) https://dev.vistasocial.com/api/integration',
    },
  };

  if (taskId) {
    try {
      const task = await clickup.getTask(taskId);
      const clientName = optionName(clickup.findFieldRef(task, clickup.FIELD.clientName));
      const frameLink = textValue(clickup.findFieldRef(task, clickup.FIELD.frameLink));

      let profileIds: string[] = [];
      if (clientName) {
        const [row] = await db
          .select({ branding: clients.brandingConfig })
          .from(clients)
          .where(eq(clients.name, clientName))
          .limit(1);
        const raw = (row?.branding as { vistaSocialProfileIds?: string } | null)?.vistaSocialProfileIds;
        profileIds = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
      }

      report.task = {
        title: task.name,
        postedStatus: optionName(clickup.findFieldRef(task, clickup.FIELD.postedStatus)),
        readyToPublish: boolValue(clickup.findFieldRef(task, clickup.FIELD.readyToPublish)),
        captionsPresent: !!textValue(clickup.findFieldRef(task, clickup.FIELD.captions)),
        publishDate: clickup.findFieldRef(task, clickup.FIELD.publishDate)?.value ?? null,
        frameLink,
        clientName,
        profileIdsCount: profileIds.length,
        instagramUrlFieldPresent: !!clickup.findFieldRef(task, clickup.FIELD.instagramUrl),
      };

      if (probe && frameLink) {
        try {
          report.frameProbe = await frameio.resolveFinalAsset(frameLink);
        } catch (e) {
          const err = e as frameio.FrameioError;
          report.frameProbe = { error: err?.message ?? String(e), stage: err?.stage, status: err?.status };
        }
      }

      // Opt-in write test: exercises the exact createComment() path the
      // native player's composer uses, N times in a row, to surface the real
      // Frame.io error behind a generic "Could not save to Frame.io" message
      // — including failures that only show up on the 2nd+ call, not the 1st
      // (live-reported: comment #1 succeeded, comment #2 hit a 422).
      if (writeTestCommentCount > 0 && frameLink) {
        const attempts: unknown[] = [];
        try {
          const fileId = await frameio.resolveFileId(frameLink);
          for (let i = 0; i < writeTestCommentCount; i++) {
            try {
              const comment = await frameio.createComment(fileId, `[debug probe ${i + 1}] ${new Date().toISOString()}`, i + 1);
              attempts.push({ ok: true, attempt: i + 1, comment });
            } catch (e) {
              const err = e as frameio.FrameioError;
              attempts.push({ ok: false, attempt: i + 1, error: err?.message ?? String(e), stage: err?.stage, status: err?.status });
            }
          }
          report.commentWriteProbe = { fileId, attempts };
        } catch (e) {
          const err = e as frameio.FrameioError;
          report.commentWriteProbe = { error: err?.message ?? String(e), stage: err?.stage, status: err?.status, attempts };
        }
      }
    } catch (e) {
      report.taskError = e instanceof Error ? e.message : String(e);
    }
  }

  // Short-link / share resolution diagnostics — read-only, safe to call
  // repeatedly. Lets us confirm the live response shape of Frame.io's Shares
  // API without guessing (the reference docs are access-gated).
  if (shortLink) {
    try {
      report.shortLinkResolved = await frameio.resolveShortLink(shortLink);
    } catch (e) {
      report.shortLinkError = e instanceof Error ? e.message : String(e);
    }
  }
  if (shareId) {
    try {
      report.shareResolved = await frameio.resolveShareAssetId(shareId);
    } catch (e) {
      const err = e as frameio.FrameioError;
      report.shareError = { error: err?.message ?? String(e), status: err?.status };
    }
  }

  return NextResponse.json(report);
}
