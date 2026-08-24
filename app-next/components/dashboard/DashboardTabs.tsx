'use client';

import { Suspense } from 'react';
import { PipelineAnalytics, type PipelineStageCounts, type PipelinePeriod, type PipelinePeriodStat, type PipelineClientRow } from './PipelineAnalytics';
import { InactiveToggle } from './InactiveToggle';
export type { PipelineStage, PipelineStageCounts, PipelinePeriod, PipelinePeriodStat, PipelineClientRow } from './PipelineAnalytics';

interface Props {
  pipelineStageTotals: PipelineStageCounts;
  pipelineStalledTotals: PipelineStageCounts;
  pipelinePeriods: Record<PipelinePeriod, PipelinePeriodStat>;
  pipelineClientRows: PipelineClientRow[];
  error?: string | null;
}

// The "Clients" tab (Portfolio overview / Asset inventory / per-client
// detail) that used to live here moved to the unified Clients page
// (app/(app)/admin/clients) — this component now only ever shows Production
// Overview, so the tab-switcher itself went away along with it.
export function DashboardTabs({ pipelineStageTotals, pipelineStalledTotals, pipelinePeriods, pipelineClientRows, error }: Props) {
  return (
    <div>
      <div className="db-topbar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 28, padding: '0 24px', borderBottom: '1px solid #e7ebef', minHeight: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Production Overview</span>
        </div>

        <div className="db-topbar-right db-dash-toggle" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          <Suspense fallback={null}>
            <InactiveToggle />
          </Suspense>
        </div>
      </div>

      {error && (
        <div style={{ margin: '18px 24px 0' }}>
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
            ClickUp error: {error}
          </div>
        </div>
      )}

      <div style={{ padding: '14px 24px 40px' }}>
        <PipelineAnalytics
          stageTotals={pipelineStageTotals}
          stalledTotals={pipelineStalledTotals}
          periods={pipelinePeriods}
          clientRows={pipelineClientRows}
        />
      </div>
    </div>
  );
}
