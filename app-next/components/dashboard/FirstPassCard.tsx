import { Card } from '@/components/ui/Card';
import { T, MONO } from '@/components/ui/tokens';
import type { FirstPassStats, MonthStats } from '@/lib/revisions';

function dash(v: number | null, suffix = '') {
  return v === null ? '—' : `${v}${suffix}`;
}

/** Green when this month improved on last month, red when it slipped, muted when there's nothing to compare. */
function deltaTone(thisMonth: number | null, lastMonth: number | null, higherIsBetter: boolean): { text: string; color: string } {
  if (thisMonth === null || lastMonth === null) return { text: 'no prior data', color: T.ink3 };
  const diff = Math.round((thisMonth - lastMonth) * 10) / 10;
  if (diff === 0) return { text: 'flat vs last month', color: T.ink3 };
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  const arrow = diff > 0 ? '↑' : '↓';
  return { text: `${arrow} ${Math.abs(diff)} vs last month`, color: improved ? T.ok : T.danger };
}

function MonthBlock({ label, stats }: { label: string; stats: MonthStats }) {
  return (
    <div style={{ flex: '1 1 160px', padding: '14px 16px', borderRadius: 11, background: T.surfaceSubtle, border: `1px solid ${T.divider}` }}>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: T.ink, margin: '6px 0 2px' }}>
        {dash(stats.cleanPct, '%')}
      </div>
      <div style={{ fontSize: 12, color: T.ink3 }}>
        {stats.avgRevisions === null ? 'no posted videos' : `${stats.avgRevisions} avg revisions/video`}
      </div>
    </div>
  );
}

/**
 * How much of what shipped needed zero revision rounds, this month vs last.
 * ClickUp's "Revision #" custom field never goes below 1 — round 1 means the
 * video reached Posted without ever being sent back — so "clean" here is
 * revisions === 1, not 0.
 */
export function FirstPassCard({ thisMonth, lastMonth }: FirstPassStats) {
  const cleanDelta = deltaTone(thisMonth.cleanPct, lastMonth.cleanPct, true);
  const missing = thisMonth.missing + lastMonth.missing;

  return (
    <Card
      title="First-pass clean"
      subtitle="Videos that reached Posted without a revision round"
    >
      {missing > 0 && (
        <div
          title="These posted videos have no value in ClickUp's Revision # field, so they're left out of the average and clean-rate below rather than counted as either clean or revised."
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 600, color: T.warn,
            background: '#fff6e5', borderRadius: 8, padding: '5px 10px',
            marginBottom: 12,
          }}
        >
          {missing} posted video{missing === 1 ? '' : 's'} missing a revision count — excluded below
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <MonthBlock label="This month" stats={thisMonth} />
        <MonthBlock label="Last month" stats={lastMonth} />
      </div>
      <div style={{ fontSize: 12, fontFamily: MONO, color: cleanDelta.color, marginTop: 10 }}>
        {cleanDelta.text}
      </div>
    </Card>
  );
}
