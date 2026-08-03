'use client';

import { useMemo, useState } from 'react';
import { MetricStrip, type KpiData } from './MetricStrip';
import { PortfolioMonthTable } from './PortfolioMonthTable';
import type { HealthTier } from '@/lib/contracts';

// Current month + the 5 before it, for the month look-back select.
function recentMonths(): { value: string; label: string }[] {
  const now = new Date();
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    return { value, label };
  });
}

export interface PortfolioClientRow {
  id: string; // contract_periods.id
  name: string;
  subtitle: string; // contract label, e.g. "Contract 2"
  health: HealthTier;
  type: 'retainer' | 'package';
  periodText: string; // "Apr 21 – Jul 20, 2026"
  expiryText: string;
  expiryTone: 'red' | 'amber' | 'green' | 'slate';
  delivered: number;
  contracted: number;
  fulfilmentPct: number | null; // null = no meaningful denominator (§7.3)
  inReview: number;
  editing: number;
  onHold: number;
  attentionScore: number;
}

interface Props {
  kpis: KpiData[];
  rows: PortfolioClientRow[];
  onSelect?: (row: PortfolioClientRow) => void;
}

const HEALTH_AVATAR_COLOR: Record<HealthTier, string> = {
  critical: '#cf5b53',
  watch: '#b58236',
  'on-track': '#FF6000',
  completed: '#5e6b7a',
  pending: '#8b97a4',
  internal: '#7c66c4',
};

const GROUPS: { key: string; label: string; dot: string; healths: HealthTier[] }[] = [
  { key: 'needs-attention', label: 'Needs attention', dot: '#cf3f36', healths: ['critical'] },
  { key: 'at-risk',         label: 'At risk / delayed', dot: '#a86a00', healths: ['watch'] },
  { key: 'on-track',        label: 'On track',          dot: '#14805f', healths: ['on-track'] },
  { key: 'completed-setup', label: 'Completed & to set up', dot: '#54616f', healths: ['completed', 'pending', 'internal'] },
];

const HEALTH_CHIPS: { key: 'all' | HealthTier; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Needs attention' },
  { key: 'watch', label: 'At risk' },
  { key: 'on-track', label: 'On track' },
  { key: 'completed', label: 'Wrapped / setup' },
];

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function deliveryBarColor(delivered: number, contracted: number): string {
  if (!contracted) return '#a86a00';
  if (delivered > contracted) return '#FF6000'; // over-delivered
  const pct = delivered / contracted;
  if (pct >= 0.75) return '#14805f';
  if (pct >= 0.4) return '#2563eb';
  return '#a86a00';
}

function TypeChip({ type }: { type: PortfolioClientRow['type'] }) {
  const isRetainer = type === 'retainer';
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7,
      color: isRetainer ? '#2563eb' : '#7c66c4',
      background: isRetainer ? '#eaf0ff' : '#efeafa',
    }}>
      {isRetainer ? 'Retainer' : 'Package'}
    </span>
  );
}

function InFlightPills({ row }: { row: PortfolioClientRow }) {
  const pills: { text: string; color: string; bg: string }[] = [];
  if (row.inReview > 0) pills.push({ text: `${row.inReview} review`, color: '#a86a00', bg: '#fbf1dc' });
  if (row.editing > 0) pills.push({ text: `${row.editing} editing`, color: '#2563eb', bg: '#eaf0ff' });
  if (row.onHold > 0) pills.push({ text: `${row.onHold} on hold`, color: '#cf3f36', bg: '#fdedeb' });
  if (pills.length === 0) return <span style={{ color: '#8b97a4' }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
      {pills.map(p => (
        <span key={p.text} style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 100, color: p.color, background: p.bg, whiteSpace: 'nowrap' }}>{p.text}</span>
      ))}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: '#8b97a4', padding: '11px 16px',
  background: '#f5f7f9', borderBottom: '1px solid #e7ebef', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #e7ebef', verticalAlign: 'middle' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'center' };

export function PortfolioTable({ kpis, rows, onSelect }: Props) {
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState<'all' | HealthTier>('all');
  const [sortKey, setSortKey] = useState<'client' | 'delivery' | 'inflight' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [period, setPeriod] = useState('current');
  const months = useMemo(() => recentMonths(), []);

  const healthCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rows.length };
    for (const r of rows) counts[r.health] = (counts[r.health] ?? 0) + 1;
    // "Wrapped / setup" chip covers completed + pending + internal together.
    counts.completed = (counts.completed ?? 0) + (counts.pending ?? 0) + (counts.internal ?? 0);
    return counts;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (healthFilter !== 'all') {
        if (healthFilter === 'completed') {
          if (!['completed', 'pending', 'internal'].includes(r.health)) return false;
        } else if (r.health !== healthFilter) return false;
      }
      if (search && !r.name.toLowerCase().includes(search.toLowerCase()) && !r.subtitle.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, healthFilter, search]);

  function sortWithin(group: PortfolioClientRow[]): PortfolioClientRow[] {
    if (!sortKey) return [...group].sort((a, b) => b.attentionScore - a.attentionScore);
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...group].sort((a, b) => {
      if (sortKey === 'client') return dir * a.name.localeCompare(b.name);
      if (sortKey === 'delivery') return dir * ((a.fulfilmentPct ?? -1) - (b.fulfilmentPct ?? -1));
      if (sortKey === 'inflight') return dir * ((a.inReview + a.editing) - (b.inReview + b.editing));
      return 0;
    });
  }

  function toggleSort(key: 'client' | 'delivery' | 'inflight') {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  }

  const sortIndicator = (key: string) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MetricStrip items={kpis} />

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 220, maxWidth: 340 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#8b97a4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16, position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search clients…"
            style={{ width: '100%', padding: '9px 12px 9px 34px', borderRadius: 8, border: '1px solid #d4dbe2', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {HEALTH_CHIPS.map(c => {
            const selected = healthFilter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setHealthFilter(c.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: selected ? '1px solid #FF6000' : '1px solid #d4dbe2',
                  background: selected ? '#fff1e8' : '#fff',
                  color: selected ? '#B23E00' : '#54616f',
                }}
              >
                {c.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>{healthCounts[c.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          style={{ marginLeft: 'auto', fontSize: 13, padding: '6px 26px 6px 10px', borderRadius: 7, border: '1px solid #d4dbe2', color: '#111c28', background: '#fff' }}
        >
          <option value="current">Current contract</option>
          {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        {period === 'current' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#8b97a4' }}>{filtered.length} of {rows.length}</span>}
      </div>

      {period !== 'current' ? (
        <PortfolioMonthTable key={period} month={period} monthLabel={months.find(m => m.value === period)?.label ?? period} />
      ) : (
        <div style={{ border: '1px solid #e7ebef', borderRadius: 13, background: '#fff', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle} onClick={() => toggleSort('client')} role="button">Client{sortIndicator('client')}</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Contract</th>
                  <th style={thStyle} onClick={() => toggleSort('delivery')} role="button">Delivery{sortIndicator('delivery')}</th>
                  <th style={thStyle}>Footage</th>
                  <th style={thStyle} onClick={() => toggleSort('inflight')} role="button">In flight{sortIndicator('inflight')}</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Billing</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: '32px 16px', textAlign: 'center', color: '#8b97a4' }}>No active contracts yet.</td></tr>
                )}
                {GROUPS.map(group => {
                  const groupRows = sortWithin(filtered.filter(r => group.healths.includes(r.health)));
                  if (groupRows.length === 0) return null;
                  return (
                    <FragmentGroup key={group.key} group={group} rows={groupRows} onSelect={onSelect} />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentGroup({ group, rows, onSelect }: { group: (typeof GROUPS)[number]; rows: PortfolioClientRow[]; onSelect?: (row: PortfolioClientRow) => void }) {
  return (
    <>
      <tr>
        <td colSpan={9} style={{ padding: '10px 16px', background: '#fafbfc', borderBottom: '1px solid #e7ebef' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: group.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#54616f' }}>{group.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, background: '#f5f7f9', borderRadius: 100, padding: '1px 8px', color: '#54616f' }}>{rows.length}</span>
          </div>
        </td>
      </tr>
      {rows.map(r => (
        <tr
          key={r.id}
          style={{ cursor: onSelect ? 'pointer' : 'default', transition: 'background .13s' }}
          onClick={() => onSelect?.(r)}
          onMouseEnter={e => (e.currentTarget.style.background = '#f5f7f9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <td style={td}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: HEALTH_AVATAR_COLOR[r.health], color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{initials(r.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#111c28' }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: '#8b97a4' }}>{r.subtitle}</div>
              </div>
            </div>
          </td>
          <td style={td}><TypeChip type={r.type} /></td>
          <td style={td}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: '#54616f' }}>{r.periodText}</div>
            <span style={{
              display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 6,
              color: r.expiryTone === 'red' ? '#cf3f36' : r.expiryTone === 'amber' ? '#a86a00' : r.expiryTone === 'green' ? '#14805f' : '#54616f',
              background: r.expiryTone === 'red' ? '#fdedeb' : r.expiryTone === 'amber' ? '#fbf1dc' : r.expiryTone === 'green' ? '#e6f4ee' : '#eef1f4',
            }}>{r.expiryText}</span>
          </td>
          <td style={tdNum}>
            {r.contracted === 0 ? (
              <span style={{ fontSize: 11.5, fontStyle: 'italic', color: '#8b97a4' }}>Awaiting production data</span>
            ) : (
              <div style={{ minWidth: 90 }}>
                <div style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)' }}>{r.delivered} · {r.fulfilmentPct !== null ? `${Math.round(r.fulfilmentPct)}%` : '—'}</div>
                <div style={{ height: 7, borderRadius: 100, background: '#f0f2f5', overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ width: `${Math.min(100, (r.delivered / r.contracted) * 100)}%`, height: '100%', borderRadius: 100, background: deliveryBarColor(r.delivered, r.contracted), transition: 'width .5s cubic-bezier(.2,.7,.3,1)' }} />
                </div>
              </div>
            )}
          </td>
          <td style={tdNum}>
            {/* Footage supply has no system of record yet (contract-schema-spec.md §"Not specified here" / handoff §11.4) — an explicit unknown state, not a fabricated count. */}
            <span style={{ fontSize: 11.5, fontStyle: 'italic', color: '#8b97a4' }}>Not tracked</span>
          </td>
          <td style={tdNum}><InFlightPills row={r} /></td>
          <td style={tdNum}>
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7,
              color: group.dot, background: group.dot === '#cf3f36' ? '#fdedeb' : group.dot === '#a86a00' ? '#fbf1dc' : group.dot === '#14805f' ? '#e6f4ee' : '#eef1f4',
            }}>{group.label}</span>
          </td>
          <td style={tdNum}>
            {/* contract_periods has no billing column (contract-schema-spec.md doesn't define one) — not tracked rather than invented. */}
            <span style={{ fontSize: 11.5, fontStyle: 'italic', color: '#8b97a4' }}>Not tracked</span>
          </td>
          <td style={{ ...tdNum, color: '#c3cbd3' }}>›</td>
        </tr>
      ))}
    </>
  );
}
