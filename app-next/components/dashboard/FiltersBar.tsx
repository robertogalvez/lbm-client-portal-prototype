'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

const DATE_RANGES = [
  { label: 'This month', value: 'month' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 3 months', value: '90d' },
  { label: 'This year', value: '365d' },
  { label: 'All time', value: 'all' },
];

interface Props {
  members: string[];
  ams: string[];
  clients: string[];
}

export function FiltersBar({ members, ams, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === 'all' || value === '') next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }, [params, pathname, router]);

  const clear = useCallback(() => {
    const next = new URLSearchParams(params.toString());
    for (const key of ['range', 'member', 'am', 'client']) next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }, [params, pathname, router]);

  const range    = params.get('range')    ?? 'month';
  const member   = params.get('member')   ?? '';
  const am       = params.get('am')       ?? '';
  const client   = params.get('client')   ?? '';

  const selectStyle: React.CSSProperties = {
    appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
    fontSize: 13, color: '#111c28', background: '#fff',
    border: '1px solid #d4dbe2', borderRadius: 7, padding: '6px 26px 6px 10px',
    cursor: 'pointer', outline: 'none',
  };
  const chevronStyle: React.CSSProperties = {
    position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)',
    fontSize: 10, color: '#8b97a4', pointerEvents: 'none',
  };

  const hasFilters = range !== 'all' || member || am || client;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative' }}>
        <select aria-label="Date range" style={selectStyle} value={range} onChange={e => set('range', e.target.value)}>
          {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      <div style={{ position: 'relative' }}>
        <select aria-label="Filter by editor" style={selectStyle} value={member} onChange={e => set('member', e.target.value)}>
          <option value="">All editors</option>
          {members.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      <div style={{ position: 'relative' }}>
        <select aria-label="Filter by account manager" style={selectStyle} value={am} onChange={e => set('am', e.target.value)}>
          <option value="">All AMs</option>
          {ams.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      <div style={{ position: 'relative' }}>
        <select aria-label="Filter by client" style={selectStyle} value={client} onChange={e => set('client', e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={clear}
          style={{ fontSize: 12, color: '#8b97a4', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
