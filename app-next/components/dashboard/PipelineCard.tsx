'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { T } from '@/components/ui/tokens';
import type { PipelinePeriod, PipelineStageCounts } from '@/lib/pipeline';

const RANGES = [
  { value: 'today' as const, label: 'Today' },
  { value: 'week' as const, label: 'This week' },
  { value: 'month' as const, label: 'This month' },
];

interface Props {
  stages: PipelineStageCounts;
  stalled: PipelineStageCounts;
  posted: Record<PipelinePeriod, number>;
  inFlight: number;
  stalledWithUs: number;
  waitingOnClient: number;
}

/**
 * Where work is sitting right now, in one strip. The four KPI cards that used
 * to sit above this restated these same numbers, so they are gone — the strip
 * is the only place the pipeline is counted.
 *
 * The five in-flight stages describe where a video sits *right now*, which
 * doesn't change with the selected range; only "Posted" is date-scoped, which
 * is what the range control drives.
 */
export function PipelineCard({ stages, stalled, posted, inFlight, stalledWithUs, waitingOnClient }: Props) {
  const [range, setRange] = useState<PipelinePeriod>('today');

  const rangeLabel = RANGES.find(r => r.value === range)!.label.toLowerCase();
  const tiles = [
    { label: 'Backlog', count: stages.backlog, stalled: 0, footer: stages.backlog > 0 ? 'footage on hand' : 'no footage waiting' },
    { label: 'Editing', count: stages.editing, stalled: stalled.editing },
    { label: 'QC', count: stages.qc, stalled: stalled.qc },
    { label: 'Client review', count: stages.review, stalled: stalled.review },
    { label: 'Ready to post', count: stages.ready, stalled: stalled.ready },
    { label: `Posted ${rangeLabel}`, count: posted[range], stalled: 0, footer: posted[range] > 0 ? 'live' : `nothing ${rangeLabel}` },
  ];
  const max = Math.max(1, ...tiles.map(t => t.count));

  return (
    <Card
      title="Pipeline"
      subtitle={`${inFlight} videos in flight · ${stalledWithUs + waitingOnClient} blocked — ${stalledWithUs} stalled with us, ${waitingOnClient} waiting on clients`}
      action={<SegmentedControl label="Posted range" options={RANGES} value={range} onChange={setRange} />}
    >
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {tiles.map(t => {
          const hasStalled = t.stalled > 0;
          return (
            <div key={t.label} style={{
              flex: '1 1 140px', padding: '14px 16px', borderRadius: 11,
              background: T.surfaceSubtle, border: `1px solid ${T.divider}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>{t.label}</span>
                <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', color: T.ink }}>{t.count}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: T.page, margin: '10px 0 8px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.max(3, (t.count / max) * 100)}%`, height: '100%', borderRadius: 999,
                  background: hasStalled ? T.brand : T.ghost,
                }} />
              </div>
              <div style={{ fontSize: 12, color: hasStalled ? T.brand : T.ink3 }}>
                {t.footer ?? (hasStalled ? `${t.stalled} stalled` : t.count > 0 ? 'moving' : 'nothing here')}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
