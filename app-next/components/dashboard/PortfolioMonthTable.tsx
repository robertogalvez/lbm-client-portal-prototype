'use client';

import { useEffect, useMemo, useState } from 'react';
import { MetricStrip, type KpiData } from './MetricStrip';
import type { MonthModeResponse, MonthModeRow, MonthOutcome } from '@/app/api/dashboard/portfolio-month/route';

const GROUPS: { key: MonthOutcome; label: string; dot: string }[] = [
  { key: 'below',                label: 'Below agreement',              dot: '#a86a00' },
  { key: 'met',                  label: 'Agreement met',                dot: '#14805f' },
  { key: 'not-reported',         label: 'Not reported',                 dot: '#54616f' },
  { key: 'no-contract',          label: 'No contract that month',       dot: '#8b97a4' },
  { key: 'package-not-monthly',  label: 'Package · not monthly',        dot: '#7c66c4' },
  { key: 'no-agreement-on-file', label: 'No monthly agreement on file', dot: '#8b97a4' },
];

const FILTER_CHIPS: { key: 'all' | MonthOutcome | 'no-contract-any'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'below', label: 'Below agreement' },
  { key: 'met', label: 'Agreement met' },
  { key: 'not-reported', label: 'Not reported' },
  { key: 'no-contract-any', label: 'No contract' },
];

const NO_CONTRACT_OUTCOMES: MonthOutcome[] = ['no-contract', 'package-not-monthly', 'no-agreement-on-file'];

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: '#8b97a4', padding: '11px 16px',
  background: '#f5f7f9', borderBottom: '1px solid #e7ebef', whiteSpace: 'nowrap',
};
const td: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #e7ebef', verticalAlign: 'middle' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'center' };

// Keyed by `month` from the caller so switching months remounts this
// component instead of needing an effect to reset stale state.
export function PortfolioMonthTable({ month, monthLabel }: { month: string; monthLabel: string }) {
  const [data, setData] = useState<MonthModeResponse | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTER_CHIPS)[number]['key']>('all');

  useEffect(() => {
    fetch(`/api/dashboard/portfolio-month?month=${month}`).then(r => r.json()).then(setData).catch(() => setData(null));
  }, [month]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.rows.filter(r => {
      if (filter !== 'all') {
        if (filter === 'no-contract-any') { if (!NO_CONTRACT_OUTCOMES.includes(r.outcome)) return false; }
        else if (r.outcome !== filter) return false;
      }
      if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data, filter, search]);

  const chipCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = { all: data.rows.length };
    for (const r of data.rows) counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
    counts['no-contract-any'] = NO_CONTRACT_OUTCOMES.reduce((sum, o) => sum + (counts[o] ?? 0), 0);
    return counts;
  }, [data]);

  if (!data) return <div style={{ color: '#8b97a4', fontSize: 13.5, padding: '20px 0' }}>Loading…</div>;

  const kpis: KpiData[] = [
    { label: 'Contracts running', value: data.kpis.contractsRunning, dotColor: '#FF6000', tip: 'Clients with an agreement (retainer or amended) covering this month.' },
    { label: 'Below agreement', value: data.kpis.belowAgreement, dotColor: '#a86a00', tip: 'Delivered less than the month\'s agreed quota.' },
    { label: 'Amended agreements', value: data.kpis.amendedAgreements, dotColor: '#7c66c4', tip: 'Months where a contract_months row deviated from the standing agreement.' },
    { label: 'Not reported', value: data.kpis.notReported, dotColor: '#54616f', tip: 'An agreement applies but nothing was delivered/recorded this month.' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <MetricStrip items={kpis} />

      <div style={{ background: '#fff1e8', border: '1px solid #ffdfcb', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: '#7a3a00' }}>
        <strong>{monthLabel}</strong> — showing each retainer&apos;s agreement for that month. Retainers repeat the same monthly agreement; months tagged <strong>Amended</strong> deviated from it.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients…"
          style={{ flex: '1 1 220px', minWidth: 220, maxWidth: 340, padding: '9px 12px', borderRadius: 8, border: '1px solid #d4dbe2', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          {FILTER_CHIPS.map(c => {
            const selected = filter === c.key;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => setFilter(c.key)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  border: selected ? '1px solid #FF6000' : '1px solid #d4dbe2',
                  background: selected ? '#fff1e8' : '#fff',
                  color: selected ? '#B23E00' : '#54616f',
                }}
              >
                {c.label}
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>{chipCounts[c.key] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12.5, color: '#8b97a4' }}>{filtered.length} of {data.rows.length}</span>
      </div>

      <div style={{ border: '1px solid #e7ebef', borderRadius: 13, background: '#fff', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thStyle}>Client</th>
                <th style={thStyle}>Type</th>
                <th style={thStyle}>Monthly agreement</th>
                <th style={thStyle}>That month</th>
                <th style={thStyle}>Month outcome</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: '#8b97a4' }}>No clients match.</td></tr>
              )}
              {GROUPS.map(group => {
                const groupRows = filtered.filter(r => r.outcome === group.key);
                if (groupRows.length === 0) return null;
                return (
                  <MonthGroupRows key={group.key} group={group} rows={groupRows} />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MonthGroupRows({ group, rows }: { group: (typeof GROUPS)[number]; rows: MonthModeRow[] }) {
  return (
    <>
      <tr>
        <td colSpan={6} style={{ padding: '10px 16px', background: '#fafbfc', borderBottom: '1px solid #e7ebef' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: group.dot, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#54616f' }}>{group.label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, background: '#f5f7f9', borderRadius: 100, padding: '1px 8px', color: '#54616f' }}>{rows.length}</span>
          </div>
        </td>
      </tr>
      {rows.map(r => (
        <tr key={r.id}>
          <td style={td}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: group.dot, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{initials(r.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#111c28' }}>{r.name}</div>
                <div style={{ fontSize: 11.5, color: '#8b97a4' }}>{r.subtitle}</div>
              </div>
            </div>
          </td>
          <td style={td}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, color: r.type === 'retainer' ? '#2563eb' : r.type === 'package' ? '#7c66c4' : '#54616f', background: r.type === 'retainer' ? '#eaf0ff' : r.type === 'package' ? '#efeafa' : '#eef1f4' }}>
              {r.type === 'retainer' ? 'Retainer' : r.type === 'package' ? 'Package' : 'Pending'}
            </span>
          </td>
          <td style={td}>
            <div style={{ fontSize: 12.5 }}>{r.agreementText}</div>
            {r.amended && <span style={{ display: 'inline-block', marginTop: 4, fontSize: 10.5, fontWeight: 600, padding: '2px 7px', borderRadius: 6, color: '#7c66c4', background: '#efeafa' }}>Amended</span>}
          </td>
          <td style={tdNum}>
            {r.quota === null ? (
              <span style={{ fontFamily: 'var(--font-mono)' }}>{r.delivered}</span>
            ) : (
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{r.delivered} / {r.quota}</div>
                {r.shortfallNote && <div style={{ fontSize: 11, color: '#a86a00', marginTop: 2 }}>{r.shortfallNote}</div>}
              </div>
            )}
          </td>
          <td style={tdNum}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, color: group.dot, background: group.dot === '#a86a00' ? '#fbf1dc' : group.dot === '#14805f' ? '#e6f4ee' : '#eef1f4' }}>{group.label}</span>
          </td>
          <td style={{ ...tdNum, color: '#c3cbd3' }}>›</td>
        </tr>
      ))}
    </>
  );
}
