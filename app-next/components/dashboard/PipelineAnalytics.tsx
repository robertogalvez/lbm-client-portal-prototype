'use client';

import { useState } from 'react';
import { InfoPopover } from '@/components/ui/Tooltip';

export type PipelineStage = 'backlog' | 'editing' | 'qc' | 'review' | 'ready';
export type PipelinePeriod = 'today' | 'week' | 'month';

export interface PipelineStageCounts {
  backlog: number;
  editing: number;
  qc: number;
  review: number;
  ready: number;
}

export interface PipelineClientRow {
  name: string;
  counts: PipelineStageCounts;
  stalled: PipelineStageCounts;
  posted: Record<PipelinePeriod, number>;
}

export interface PipelinePeriodStat {
  label: string;
  posted: number;
  delta?: { text: string; good: boolean };
}

interface Props {
  stageTotals: PipelineStageCounts;
  stalledTotals: PipelineStageCounts;
  periods: Record<PipelinePeriod, PipelinePeriodStat>;
  clientRows: PipelineClientRow[];
}

const STAGE_META: { key: PipelineStage; label: string; dot: string }[] = [
  { key: 'backlog', label: 'Backlog',        dot: '#54616f' },
  { key: 'editing', label: 'Editing',        dot: '#2563eb' },
  { key: 'qc',      label: 'QC',             dot: '#7c66c4' },
  { key: 'review',  label: 'Client Review',  dot: '#a86a00' },
  { key: 'ready',   label: 'Ready to Post',  dot: '#14805f' },
];
const POSTED_DOT = '#FF6000';

const STAGE_SUM = (counts: PipelineStageCounts) => STAGE_META.reduce((s, { key }) => s + counts[key], 0);

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AV_COLORS = ['#FF6000', '#5e6b7a', '#5172c4', '#7c66c4', '#b58236'];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AV_COLORS[Math.abs(hash) % AV_COLORS.length];
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#f5f7f9', border: '1px solid #e7ebef', padding: '7px 11px', borderRadius: 8, color: '#8b97a4', fontSize: 12.5, minWidth: 190 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
        <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Search clients…"
        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: '#111c28', width: '100%' }}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'center', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: '#8b97a4', padding: '10px 12px',
  background: '#f5f7f9', borderBottom: '1px solid #e7ebef', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid #e7ebef', verticalAlign: 'middle', textAlign: 'center' };
const numStyle: React.CSSProperties = { fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

export function PipelineAnalytics({ stageTotals, stalledTotals, periods, clientRows }: Props) {
  const [period, setPeriod] = useState<PipelinePeriod>('today');
  const [search, setSearch] = useState('');

  const inFlight = STAGE_SUM(stageTotals);
  const stalledCount = STAGE_SUM(stalledTotals);
  const activePeriod = periods[period];

  const filteredRows = clientRows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  // Stage/in-flight totals come straight from the `stageTotals`/`inFlight`
  // props (already the authoritative sum across every client) rather than
  // being re-derived here, so the footer can never drift from the pulse
  // strip above it. Only "Posted" needs a fresh sum — it's the one figure
  // that depends on the period toggle, and always reflects every client,
  // not just the search-filtered set.
  const grandPosted = clientRows.reduce((sum, r) => sum + r.posted[period], 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.005em' }}>Pipeline analytics</div>
          <div style={{ fontSize: 12, color: '#8b97a4' }}>Where every video stands, across the whole editing pipeline</div>
        </div>
        <div style={{ display: 'inline-flex', background: '#f5f7f9', border: '1px solid #e7ebef', borderRadius: 9, padding: 3, gap: 2 }}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                fontSize: 12.5, fontWeight: 600, borderRadius: 7, padding: '6px 13px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                background: period === p ? '#fff' : 'transparent',
                color: period === p ? '#111c28' : '#54616f',
                boxShadow: period === p ? '0 1px 2px rgba(17,28,40,.08)' : 'none',
              }}
            >
              {periods[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* Pulse strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
        <PulseCell label="In flight" tip="Videos anywhere between Backlog and Ready to Post, right now — not scoped to the period above." value={inFlight} dot="#FF6000" />
        <PulseCell
          label={`Posted · ${activePeriod.label}`}
          tip="Videos that reached Posted in Socials within the selected period."
          value={activePeriod.posted}
          dot="#14805f"
          delta={activePeriod.delta}
        />
        <PulseCell label="Client review" tip="Videos currently sitting in For Client Review, right now." value={stageTotals.review} dot="#a86a00" />
        <PulseCell
          label="Stalled >3d"
          tip="In-flight videos (Editing/QC/Client Review/Ready to Post) that haven't changed status in over 3 days."
          value={stalledCount}
          dot="#cf3f36"
          sub={stalledCount > 0 ? 'Needs a nudge' : undefined}
        />
      </div>

      {/* Pipeline flow */}
      <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', padding: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 0 }}>
          {STAGE_META.map((s, i) => (
            <FlowStage key={s.key} label={s.label} dot={s.dot} count={stageTotals[s.key]} stalled={stalledTotals[s.key]} caption="right now" showArrow={i > 0} />
          ))}
          <FlowStage label="Posted" dot={POSTED_DOT} count={activePeriod.posted} caption={activePeriod.label.toLowerCase()} showArrow />
        </div>
      </div>

      {/* Per-client matrix */}
      <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef', flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>By client</h3>
            <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>{clientRows.length} clients with videos in flight or posted this period</div>
          </div>
          <SearchInput value={search} onChange={setSearch} />
        </div>
        <div className="db-tscroll" style={{ maxHeight: 460 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left', paddingLeft: 18 }}>Client</th>
                {STAGE_META.map(s => <th key={s.key} style={thStyle}>{s.label}</th>)}
                <th style={{ ...thStyle, color: '#14805f' }}>Posted<br />{activePeriod.label}</th>
                <th style={thStyle}>Total<br />in flight <InfoPopover tip="Sum of Backlog through Ready to Post for this client, right now." /></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(r => {
                const total = STAGE_SUM(r.counts);
                return (
                  <tr key={r.name}>
                    <td style={{ ...td, textAlign: 'left', paddingLeft: 18 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor(r.name), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(r.name)}</span>
                        {r.name}
                      </div>
                    </td>
                    {STAGE_META.map(s => (
                      <td key={s.key} style={td}>
                        <StageCell value={r.counts[s.key]} stalled={r.stalled[s.key]} />
                      </td>
                    ))}
                    <td style={td}>
                      <span style={{ ...numStyle, fontWeight: 700, color: r.posted[period] > 0 ? '#14805f' : '#d4dbe2' }}>{r.posted[period] > 0 ? r.posted[period] : '—'}</span>
                    </td>
                    <td style={td}><span style={{ ...numStyle, fontWeight: 700 }}>{total}</span></td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 && (
                <tr><td colSpan={STAGE_META.length + 3} style={{ padding: '24px 18px', color: '#8b97a4', textAlign: 'center' }}>No clients match your search</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr style={{ background: '#f5f7f9' }}>
                <td style={{ ...td, textAlign: 'left', paddingLeft: 18, fontWeight: 700 }}>All clients</td>
                {STAGE_META.map(s => (
                  <td key={s.key} style={td}><span style={{ ...numStyle, fontWeight: 700 }}>{stageTotals[s.key]}</span></td>
                ))}
                <td style={td}><span style={{ ...numStyle, fontWeight: 700, color: '#14805f' }}>{grandPosted}</span></td>
                <td style={td}><span style={{ ...numStyle, fontWeight: 700 }}>{inFlight}</span></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

function PulseCell({ label, tip, value, dot, sub, delta }: { label: string; tip: string; value: number; dot: string; sub?: string; delta?: { text: string; good: boolean } }) {
  return (
    <div style={{ flex: '1 1 170px', minWidth: 0, padding: '11px 16px', borderRight: '1px solid #e7ebef', display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ fontSize: 11.5, color: '#54616f', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
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
      {sub && <div style={{ fontSize: 11, fontWeight: 600, color: '#a86a00' }}>{sub}</div>}
    </div>
  );
}

function FlowStage({ label, dot, count, stalled, caption, showArrow }: { label: string; dot: string; count: number; stalled?: number; caption: string; showArrow: boolean }) {
  return (
    <>
      {showArrow && (
        <div style={{ flex: '0 0 22px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d4dbe2', fontSize: 15 }}>→</div>
      )}
      <div style={{ flex: '1 1 150px', minWidth: 148, padding: '4px 6px' }}>
        <div style={{ border: '1px solid #e7ebef', background: '#f5f7f9', borderRadius: 10, padding: '14px 14px 12px', height: '100%' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#54616f', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
            {label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '6px 0 4px' }}>
            <span style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', lineHeight: 1 }}>{count}</span>
            {!!stalled && (
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)', background: '#fdedeb', color: '#cf3f36', borderRadius: 100, padding: '2px 6px', whiteSpace: 'nowrap' }}>
                {stalled} stalled
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#8b97a4' }}>videos {caption}</div>
        </div>
      </div>
    </>
  );
}

function StageCell({ value, stalled }: { value: number; stalled: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <span style={{ ...numStyle, fontWeight: value > 0 ? 600 : 400, color: value > 0 ? '#111c28' : '#d4dbe2' }}>{value > 0 ? value : '—'}</span>
      {stalled > 0 && (
        <span
          title={`${stalled} of these ${stalled === 1 ? 'has' : 'have'} sat here over 3 days`}
          style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: '#cf3f36', background: '#fdedeb', borderRadius: 100, padding: '1px 5px' }}
        >
          ⚠{stalled}
        </span>
      )}
    </span>
  );
}
