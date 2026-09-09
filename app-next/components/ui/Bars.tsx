import { T, COVERAGE_COLORS } from './tokens';

/** Single-value progress track. */
export function ProgressBar({ pct, color, width, height = 6 }: { pct: number; color?: string; width?: number; height?: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ width: width ?? '100%', height, borderRadius: 999, background: T.page, overflow: 'hidden' }}>
      <div style={{ width: `${clamped}%`, height: '100%', borderRadius: 999, background: color ?? T.brand }} />
    </div>
  );
}

/**
 * Coverage stacked bar. `delivered` = already live, `scheduled` = produced and
 * queued with a future publish date (optional, defaults to 0), `inPipeline` =
 * everything else still in production. Renders up to four colour segments so
 * the difference between "live" and "scheduled" is visible at a glance.
 */
export function CoverageBar({
  sold, delivered, scheduled = 0, inPipeline, height = 8,
}: {
  sold: number; delivered: number; scheduled?: number; inPipeline: number; height?: number;
}) {
  const denom = Math.max(sold, delivered + scheduled + inPipeline, 1);
  const pct = (n: number) => `${(n / denom) * 100}%`;
  return (
    <div style={{ display: 'flex', width: '100%', height, borderRadius: 999, background: COVERAGE_COLORS.track, overflow: 'hidden' }}>
      <div style={{ width: pct(delivered), background: COVERAGE_COLORS.delivered }} />
      {scheduled > 0 && <div style={{ width: pct(scheduled), background: COVERAGE_COLORS.scheduled }} />}
      <div style={{ width: pct(inPipeline), background: COVERAGE_COLORS.inPipeline }} />
      <div style={{ width: pct(Math.max(0, sold - delivered - scheduled - inPipeline)), background: COVERAGE_COLORS.notStarted }} />
    </div>
  );
}

export function CoverageLegend({ showScheduled = false }: { showScheduled?: boolean }) {
  const items: [string, string][] = [
    ['Posted live', COVERAGE_COLORS.delivered],
    ...(showScheduled ? [['Scheduled', COVERAGE_COLORS.scheduled] as [string, string]] : []),
    ['In progress', COVERAGE_COLORS.inPipeline],
    ['Not started', COVERAGE_COLORS.notStarted],
  ];
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
      {items.map(([label, color]) => (
        <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: T.ink3 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}
