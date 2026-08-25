// Task↔client matching and the raw-footage backlog. The portfolio row
// builders that used to live here were superseded by lib/admin-views.ts,
// which computes coverage and pipeline stage buckets in one pass so every
// admin screen reads the same numbers.

import type { MappedTask } from '@/lib/clickup';
import type { ContractPeriod } from '@/lib/db/schema';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function parseDate(s: string) {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}

// Statuses that count as raw, unedited footage on hand. Feeds buildBacklog's
// footage-supply math AND the pipeline's "Backlog" stage (lib/pipeline.ts),
// so both agree on what counts as backlog.
export const BACKLOG_STATUSES = new Set(['not ready', 'backlog', 'not assigned']);
// The actual go-live moment for a POSTED task: publishDate when set (the
// source of truth), falling back to dateUpdated for tasks posted before this
// field was tracked, or posted manually outside VistaSocial.
export function resolvePostedAt(t: MappedTask): number {
  return t.publishDate ? new Date(t.publishDate).getTime() : parseDate(t.dateUpdated);
}

export function buildBacklog(tasks: MappedTask[]): { name: string; backlogCount: number }[] {
  const map = new Map<string, number>();
  for (const t of tasks) {
    const name = t.clientName ?? 'Unknown';
    if (!map.has(name)) map.set(name, 0);
    if (BACKLOG_STATUSES.has(norm(t.status))) map.set(name, map.get(name)! + 1);
  }
  return Array.from(map.entries())
    .map(([name, backlogCount]) => ({ name, backlogCount }))
    .sort((a, b) => a.backlogCount - b.backlogCount);
}

export interface ContractJoinRow {
  id: string;
  clientName: string;
  clickupClientOptionId: string | null;
  label: string;
  startsOn: string;
  endsOn: string | null;
  model: string;
  contractedTotal: number;
  state: ContractPeriod['state'];
}

// One entry per client in the whole roster — `period` is null for a client
// with no resolved current contract (a just-synced "Needs setup" client).
// Portfolio is now the single landing view for /admin/clients (folding in
// what used to be the separate Directory tab), so it has to show every
// client, not just ones already under an active/extended contract.
export interface ClientPortfolioInput {
  clientId: string;
  clientName: string;
  billing: 'retainer' | 'one_time' | null;
  portalUserCount: number;
  period: ContractJoinRow | null;
}

// A task belongs to this period's client if the stable ClickUp option id
// matches (the real join — see clients.clickupClientOptionId, added by the
// contract redesign's Decision 3). Falls back to normalized-name matching
// only when the id isn't resolved on one side yet (client not synced since
// the option-id backfill, or the task's own field unset) — never "shows
// nothing" just because the ID isn't populated yet.
export function matchesClient(t: MappedTask, p: Pick<ContractJoinRow, 'clientName' | 'clickupClientOptionId'>): boolean {
  if (p.clickupClientOptionId && t.clientOptionId) return t.clientOptionId === p.clickupClientOptionId;
  return norm(t.clientName ?? '') === norm(p.clientName);
}
