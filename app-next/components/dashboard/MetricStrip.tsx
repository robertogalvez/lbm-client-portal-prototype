import { InfoPopover } from '@/components/ui/Tooltip';

export interface KpiData {
  label: string;
  tip: string;
  value: string | number;
  dotColor: string;
  sub?: string;
  subTone?: 'warn' | 'muted';
  delta?: { text: string; good: boolean };
}

// One bordered bar with hairline dividers between cells, not separate cards
// (§5.1 / §5.2 — the dashboard's pulse strip and the Clients tab's KPI strip
// share this exact treatment). Density is a requirement, not a preference.
export function MetricStrip({ items }: { items: KpiData[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      {items.map(k => <MetricCell key={k.label} {...k} />)}
    </div>
  );
}

function MetricCell({ label, tip, value, dotColor, sub, subTone, delta }: KpiData) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: 0, padding: '11px 16px', borderRight: '1px solid #e7ebef', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 11.5, color: '#54616f', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
        <InfoPopover tip={tip} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: '#111c28', lineHeight: 1, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{value}</div>
        {delta && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 5,
            fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums',
            color: delta.good ? '#14805f' : '#cf3f36',
            background: delta.good ? '#e6f4ee' : '#fdedeb',
          }}>
            {delta.text}
          </span>
        )}
      </div>
      {sub && (
        <div style={{ fontSize: 11, fontWeight: 600, color: subTone === 'warn' ? '#a86a00' : '#8b97a4', display: 'flex', alignItems: 'center', gap: 4 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
