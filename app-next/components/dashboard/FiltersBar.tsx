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
  clients: string[];
}

export function FiltersBar({ members, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = useCallback((key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === 'all' || value === '') next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }, [params, pathname, router]);

  const range  = params.get('range')  ?? 'all';
  const member = params.get('member') ?? '';
  const client = params.get('client') ?? '';

  const selectStyle: React.CSSProperties = {
    fontSize: 13, color: '#111c28', background: '#fff',
    border: '1px solid #d4dbe2', borderRadius: 7, padding: '6px 10px',
    cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Filter</span>

      <select style={selectStyle} value={range} onChange={e => set('range', e.target.value)}>
        {DATE_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>

      <select style={selectStyle} value={member} onChange={e => set('member', e.target.value)}>
        <option value="">All members</option>
        {members.map(m => <option key={m} value={m}>{m}</option>)}
      </select>

      <select style={selectStyle} value={client} onChange={e => set('client', e.target.value)}>
        <option value="">All clients</option>
        {clients.map(c => <option key={c} value={c}>{c}</option>)}
      </select>

      {(range !== 'all' || member || client) && (
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
