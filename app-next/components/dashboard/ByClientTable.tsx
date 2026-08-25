'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { T, dash } from '@/components/ui/tokens';
import { colHeader, headerRow, bodyRow, emptyState, tableFooter } from '@/components/ui/table';
import type { AdminClientRow } from '@/lib/admin-views';

const GRID = '2fr 1fr 1.1fr 1.1fr 2.4fr';

/** The plan line under the client's name: what kind of contract, and its trouble. */
function planLine(r: AdminClientRow): string {
  if (!r.periodId) return 'No contract yet';
  const kind = r.model === 'package' ? 'Package' : 'Retainer';
  if (r.termDaysLeft !== null && r.termDaysLeft < 0) return `${kind} · contract expired ${Math.abs(r.termDaysLeft)}d ago`;
  if (r.coverage && r.coverage.sold > 0) return `${kind} · ${r.coverage.delivered} of ${r.coverage.sold} delivered`;
  return `${kind} · active`;
}

export function ByClientTable({ rows, inactiveCount }: { rows: AdminClientRow[]; inactiveCount: number }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  return (
    <Card
      title="By client"
      subtitle="Sorted by what is blocking longest"
      padded={false}
      action={
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
          style={{
            width: 260, padding: '9px 12px', borderRadius: 9,
            border: `1px solid ${T.lineStrong}`, fontFamily: 'inherit', fontSize: 13, color: T.ink,
          }}
        />
      }
    >
      <div style={{ ...headerRow(GRID), paddingTop: 4 }}>
        <span style={colHeader}>Client</span>
        <span style={colHeader}>In flight</span>
        <span style={colHeader}>Stuck with us</span>
        <span style={colHeader}>Waiting on client</span>
        <span style={colHeader}>What to do</span>
      </div>

      {filtered.length === 0 && <div style={emptyState}>No clients match “{query}”.</div>}

      {filtered.map(r => (
        <Link
          key={r.id}
          href={r.periodId ? `/admin/clients/${r.periodId}` : `/admin/clients?client=${r.clientId}`}
          style={{ ...bodyRow(GRID), textDecoration: 'none', color: 'inherit' }}
          className="db-row-link"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
            <Avatar name={r.name} color={r.avatarColor} />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 2 }}>{planLine(r)}</span>
            </span>
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: r.inFlight ? T.ink : T.ghost }}>{dash(r.inFlight)}</span>
          <span style={{ fontSize: 15, fontWeight: r.stalledWithUs ? 700 : 600, color: r.stalledWithUs ? T.brand : T.ghost }}>{dash(r.stalledWithUs)}</span>
          <span style={{ fontSize: 15, fontWeight: r.waitingOnClient ? 700 : 600, color: r.waitingOnClient ? '#B4762A' : T.ghost }}>{dash(r.waitingOnClient)}</span>
          <span style={{ fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{r.nextAction}</span>
        </Link>
      ))}

      <div style={tableFooter}>
        {rows.length} active client{rows.length === 1 ? '' : 's'}
        {inactiveCount > 0 && ` · ${inactiveCount} inactive hidden`}
      </div>
    </Card>
  );
}
