// First-pass clean rate: how much of what shipped this month needed zero
// revision rounds, vs last month. Lives alongside lib/pipeline.ts as its own
// selector so the Dashboard and any future screen compute it identically.

import type { MappedTask } from '@/lib/clickup';
import { norm, POSTED } from '@/lib/pipeline';
import { resolvePostedAt } from '@/lib/portfolio';

export interface MonthStats {
  /** Posted tasks in this window with a revision count logged. */
  sampleSize: number;
  /** Posted tasks in this window with no revision count logged — excluded from avg/cleanPct, not silently dropped. */
  missing: number;
  /** null when sampleSize is 0 — nothing to average. */
  avgRevisions: number | null;
  /** Share of sampleSize that hit Posted on revision round 1 (ClickUp's "Revision #" never goes below 1). null when sampleSize is 0. */
  cleanPct: number | null;
}

export interface FirstPassStats {
  thisMonth: MonthStats;
  lastMonth: MonthStats;
}

function monthStats(tasks: MappedTask[], start: number, end: number): MonthStats {
  const inWindow = tasks.filter(t => {
    if (norm(t.status) !== POSTED) return false;
    const postedAt = resolvePostedAt(t);
    return postedAt >= start && postedAt < end;
  });
  const withValue = inWindow.filter(t => t.revisions != null);
  const missing = inWindow.length - withValue.length;
  const sampleSize = withValue.length;
  if (sampleSize === 0) return { sampleSize: 0, missing, avgRevisions: null, cleanPct: null };

  const avgRevisions = withValue.reduce((s, t) => s + (t.revisions as number), 0) / sampleSize;
  const cleanCount = withValue.filter(t => t.revisions === 1).length;
  return {
    sampleSize,
    missing,
    avgRevisions: Math.round(avgRevisions * 10) / 10,
    cleanPct: Math.round((cleanCount / sampleSize) * 1000) / 10,
  };
}

export function buildFirstPassStats(tasks: MappedTask[], now: Date): FirstPassStats {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

  return {
    thisMonth: monthStats(tasks, thisMonthStart, nextMonthStart),
    lastMonth: monthStats(tasks, lastMonthStart, thisMonthStart),
  };
}
