// Plain-language status text for the client-facing portal. Never the raw
// ClickUp status string: that leaked internal reviewer shorthand straight to
// clients (e.g. "in tc/qc (somu)" — "Somu" is a teammate's name) on the video
// detail page and the "In Progress — Edition" list, since both fell back to
// task.status whenever no explicit label was passed in.

import { norm, pipelineStageOf, POSTED, ARCHIVED_STATUSES } from '@/lib/pipeline';

export function clientStatusLabel(status: string): string {
  const s = norm(status);
  if (s === POSTED) return 'Posted';
  if (s === 'for client review') return 'Awaiting your review';
  if (ARCHIVED_STATUSES.has(s)) return 'Archived';

  const stage = pipelineStageOf(s);
  if (stage === 'editing') return 'In editing';
  if (stage === 'qc') return 'In QC';
  if (stage === 'ready') return 'Ready to post';
  if (stage === 'backlog') return 'In backlog';

  // Statuses the client portal's own IN_PROD_STATUSES list still recognises
  // but that don't map to a lib/pipeline.ts stage (e.g. legacy "on its way",
  // "approved · fixes pending") — generic and safe rather than leaking the
  // raw internal text.
  return 'In progress';
}
