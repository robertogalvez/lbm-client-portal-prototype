import { InfoPopover } from '@/components/ui/Tooltip';
import type { AgreedDeliveredRow } from './DashboardTabs';

interface Props {
  rows: AgreedDeliveredRow[];
  periodLabel: string;
}

export function AgreedVsDeliveredChart({ rows, periodLabel }: Props) {
  const max = Math.max(...rows.map(r => Math.max(r.agreed, r.delivered)), 1);

  return (
    <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
            Agreed vs. Delivered
            <InfoPopover tip="Agreed is each client's monthly Reels + YT video quota, prorated for the selected period. Delivered counts videos that reached 'Posted in Socials' in that same period." />
          </h3>
          <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>{periodLabel}</div>
        </div>
      </div>

      {rows.length === 0 ? (
        <div style={{ padding: '20px 18px', color: '#8b97a4', fontSize: 13 }}>No client quota data available.</div>
      ) : (
        <div className="db-tscroll" style={{ maxHeight: 340, padding: '10px 18px 14px' }}>
          {rows.map(r => {
            const agreedPct    = Math.round((r.agreed / max) * 100);
            const deliveredPct = Math.round((r.delivered / max) * 100);
            const onTrack = r.delivered >= r.agreed;
            return (
              <div key={r.name} style={{ padding: '10px 0', borderBottom: '1px solid #f0f2f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  <span>{r.name}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: onTrack ? '#14805f' : '#a86a00' }}>
                    {r.delivered} / {r.agreed}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ height: 7, background: '#f0f2f5', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ width: `${agreedPct}%`, height: '100%', borderRadius: 100, background: '#aeb9c6' }} />
                  </div>
                  <div style={{ height: 7, background: '#f0f2f5', borderRadius: 100, overflow: 'hidden' }}>
                    <div style={{ width: `${deliveredPct}%`, height: '100%', borderRadius: 100, background: onTrack ? '#14805f' : '#a86a00' }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
