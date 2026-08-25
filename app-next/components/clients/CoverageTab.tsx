'use client';

import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { CoverageBar, CoverageLegend } from '@/components/ui/Bars';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { T, MONO, COVERAGE_COLORS } from '@/components/ui/tokens';
import { colHeader, headerRow, emptyState } from '@/components/ui/table';
import type { AdminClientRow } from '@/lib/admin-views';
import { buildCoverageSummary } from '@/lib/admin-views';
import type { PaceNeeded } from '@/lib/contracts';

const GRID = '2.1fr 0.7fr 0.9fr 0.9fr 1.2fr 1fr 1.7fr';

/**
 * The actionable field, and the reason this screen does not show
 * percent-delivered: a percentage cannot tell you whether the remainder is in
 * production or does not exist yet, and a pace figure is meaningless without
 * a deadline — so an expired term states the contractual problem instead.
 */
function paceText(pace: PaceNeeded | null, r: AdminClientRow): string {
  if (!pace) return '—';
  switch (pace.kind) {
    case 'covered':
      return r.coverage?.status === 'over'
        ? `${r.coverage.over} over contract${r.termExpired ? ', term expired' : ''}`
        : 'Covered — just keep it moving';
    case 'pace':
      return `${pace.perWeek} / week to finish on time`;
    case 'open':
      return `${pace.remaining} to brief · no deadline to pace against`;
    case 'blocked':
      return r.termExpired
        ? `Contract ended, ${pace.remaining} still owed`
        : `No term on file, ${pace.remaining} still owed`;
  }
}

function termLeftText(r: AdminClientRow): string {
  if (r.termDaysLeft === null) return 'Open-ended';
  return r.termDaysLeft < 0 ? `Ended ${Math.abs(r.termDaysLeft)}d ago` : `${r.termDaysLeft} days`;
}

function notStartedTone(r: AdminClientRow): 'red' | 'amber' | 'green' {
  const cov = r.coverage!;
  if (cov.status === 'covered') return 'green';
  if (cov.status === 'over') return 'amber';
  return r.termExpired || r.stages.backlog === 0 ? 'red' : 'amber';
}

function SummaryBlock({ dot, label, metric, unit, reason, cta }: {
  dot: string; label: string; metric: number; unit: string; reason: string;
  /** Omitted when the block is at zero — a CTA with nowhere to go is worse than no CTA. */
  cta?: { label: string; href: string };
}) {
  return (
    <div style={{ flex: '1 1 240px', padding: '18px 24px 22px', borderTop: `1px solid ${T.divider}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot }} />
        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.ink3 }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, margin: '12px 0 8px' }}>
        <span style={{ fontSize: 40, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.03em', color: T.ink }}>{metric}</span>
        <span style={{ fontSize: 13, color: T.ink3 }}>{unit}</span>
      </div>
      <p style={{ fontSize: 13, color: T.ink2, lineHeight: 1.5, margin: '0 0 14px' }}>{reason}</p>
      {cta && (
        <Link
          href={cta.href}
          style={{
            display: 'inline-block', padding: '9px 14px', borderRadius: 10,
            background: T.ink, color: '#fff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none',
          }}
        >
          {cta.label}
        </Link>
      )}
    </div>
  );
}

/**
 * Screen 2, tab B — "do we have enough videos in motion to honour what we sold?"
 *
 * Everything rests on notStarted = sold − delivered − inPipeline (lib/contracts.ts).
 * No screen in the old portal computed it, so a contract could be a hundred
 * videos short and nothing on screen would say so.
 */
export function CoverageTab({ rows }: { rows: AdminClientRow[] }) {
  const summary = buildCoverageSummary(rows);

  // Biggest uncovered gap first — that is the order the work should be done in.
  const contractRows = rows
    .filter(r => r.coverage !== null)
    .sort((a, b) => b.coverage!.notStarted - a.coverage!.notStarted || b.coverage!.over - a.coverage!.over);

  const worstShort = summary.shortRows[0];
  const firstCovered = summary.coveredRows[0];
  const firstOver = summary.overRows[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <Card
        title="Coverage right now"
        subtitle="Sold minus delivered minus what is already in the pipeline"
        padded={false}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <SummaryBlock
            dot={T.brand}
            label="Contracts short of coverage"
            metric={summary.shortRows.length}
            unit={summary.shortRows.length === 1 ? 'contract' : 'contracts'}
            reason={
              summary.videosNotStarted > 0
                ? `${summary.videosNotStarted} videos are sold but not yet shot, briefed or started. This is the number that becomes a missed deadline.`
                : 'Every live contract has its full scope either delivered or already in the pipeline.'
            }
            cta={worstShort ? { label: 'See the gaps', href: `/admin/clients/${worstShort.periodId}` } : undefined}
          />
          <SummaryBlock
            dot={COVERAGE_COLORS.delivered}
            label="Fully covered"
            metric={summary.coveredRows.length}
            unit={summary.coveredRows.length === 1 ? 'contract' : 'contracts'}
            reason={
              firstCovered
                ? `${firstCovered.name} — everything sold is either delivered or already in the pipeline.`
                : 'No contract is fully covered right now.'
            }
            cta={firstCovered ? { label: 'View', href: `/admin/clients/${firstCovered.periodId}` } : undefined}
          />
          <SummaryBlock
            dot={COVERAGE_COLORS.inPipeline}
            label="Over-committed pipeline"
            metric={summary.videosOver}
            unit={summary.videosOver === 1 ? 'video' : 'videos'}
            reason={
              firstOver
                ? `${firstOver.name.split(' ')[0]} has ${firstOver.coverage!.over} more in flight than the contract covers — unbilled work unless the term is renewed.`
                : 'Nothing is running beyond what its contract covers.'
            }
            cta={firstOver ? { label: 'Check contract', href: `/admin/clients/${firstOver.periodId}` } : undefined}
          />
        </div>
      </Card>

      <Card
        title="Every live contract"
        subtitle="Biggest uncovered gap first"
        padded={false}
        action={<CoverageLegend />}
      >
        <div style={{ ...headerRow(GRID), padding: '4px 24px 12px' }}>
          <span style={colHeader}>Client / contract</span>
          <span style={colHeader}>Sold</span>
          <span style={colHeader}>Delivered</span>
          <span style={colHeader}>In pipeline</span>
          <span style={colHeader}>Not started</span>
          <span style={colHeader}>Term left</span>
          <span style={colHeader}>Pace needed</span>
        </div>

        {contractRows.length === 0 && <div style={emptyState}>No contracts on file to measure coverage against.</div>}

        {contractRows.map(r => {
          const cov = r.coverage!;
          return (
            <Link
              key={r.id}
              href={`/admin/clients/${r.periodId}`}
              className="db-row-link"
              style={{ display: 'block', padding: '15px 24px', borderTop: `1px solid ${T.dividerLight}`, textDecoration: 'none', color: 'inherit' }}
            >
              <span style={{ display: 'grid', gridTemplateColumns: GRID, gap: 16, alignItems: 'center' }}>
                <span>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink }}>{r.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
                    {r.model === 'package' ? 'Package' : 'Retainer'} · {cov.sold}
                  </span>
                </span>
                <span style={{ fontSize: 15, fontWeight: 600, color: T.ink }}>{cov.sold}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: COVERAGE_COLORS.delivered }}>{cov.delivered}</span>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#B4762A' }}>{cov.inPipeline}</span>
                <span>
                  <StatusBadge tone={notStartedTone(r)} dot={false}>
                    {cov.status === 'short' ? `+${cov.notStarted} to start` : cov.status === 'over' ? `${cov.over} over` : 'none'}
                  </StatusBadge>
                </span>
                <span style={{ fontFamily: MONO, fontSize: 12, color: T.ink2 }}>{termLeftText(r)}</span>
                <span style={{ fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{paceText(r.pace, r)}</span>
              </span>
              <span style={{ display: 'block', marginTop: 12 }}>
                <CoverageBar sold={cov.sold} delivered={cov.delivered} inPipeline={cov.inPipeline} />
              </span>
            </Link>
          );
        })}

        {summary.noContractRows.length > 0 && (
          <p style={{ padding: '16px 24px 4px', fontSize: 12.5, color: T.ink3, lineHeight: 1.55, margin: 0 }}>
            {summary.noContractRows.map(r => r.name).join(' and ')}{' '}
            {summary.noContractRows.length === 1 ? 'has' : 'have'} no contract on file, so there is nothing to
            measure coverage against
            {summary.noContractRows.some(r => r.inFlight > 0) && (
              <> — {summary.noContractRows.filter(r => r.inFlight > 0).map(r => `${r.inFlight} videos are in flight for ${r.name.split(' ')[0]}`).join(', ')} regardless</>
            )}.
          </p>
        )}
      </Card>
    </div>
  );
}
