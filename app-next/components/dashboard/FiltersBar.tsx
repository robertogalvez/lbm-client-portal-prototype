'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

const DATE_RANGES = [
  { label: 'All time', value: 'all' },
  { label: 'Last 30 days', value: '30d' },
  { label: 'Last 3 months', value: '90d' },
  { label: 'This year', value: '365d' },
];

interface Props {
  members: string[];
  ams: string[];
  clients: string[];
  hideDateRange?: boolean;
}

export function FiltersBar({ members, ams, clients, hideDateRange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === 'all' || value === '') next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }, [params, pathname, router]);

  const range    = params.get('range')    ?? 'all';
  const member   = params.get('member')   ?? '';
  const am       = params.get('am')       ?? '';
  const client   = params.get('client')   ?? '';
  const archived = params.get('archived') === '1';
  const inactive = params.get('inactive') === '1';

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

  const hasFilters = (hideDateRange ? false : range !== 'all') || member || am || client || archived || inactive;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {!hideDateRange && (
        <div style={{ position: 'relative' }}>
          <select style={selectStyle} value={range} onChange={e => set('range', e.target.value)}>
            {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <span style={chevronStyle}>▾</span>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <select style={selectStyle} value={member} onChange={e => set('member', e.target.value)}>
          <option value="">All editors</option>
          {members.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      <div style={{ position: 'relative' }}>
        <select style={selectStyle} value={am} onChange={e => set('am', e.target.value)}>
          <option value="">All AMs</option>
          {ams.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      <div style={{ position: 'relative' }}>
        <select style={selectStyle} value={client} onChange={e => set('client', e.target.value)}>
          <option value="">All clients</option>
          {clients.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={chevronStyle}>▾</span>
      </div>

      {/* Archived toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#54616f', userSelect: 'none' }}>
        <div
          onClick={() => set('archived', archived ? '' : '1')}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: archived ? '#FF6000' : '#d4dbe2',
            position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: archived ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        Show archived
      </label>

      {/* Inactive clients toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#54616f', userSelect: 'none' }}>
        <div
          onClick={() => set('inactive', inactive ? '' : '1')}
          style={{
            width: 36, height: 20, borderRadius: 10,
            background: inactive ? '#FF6000' : '#d4dbe2',
            position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute', top: 2, left: inactive ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%', background: '#fff',
            transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </div>
        Show inactive clients
      </label>

      {hasFilters && (
        <button
          onClick={() => router.push(pathname)}
          style={{ fontSize: 12, color: '#8b97a4', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
