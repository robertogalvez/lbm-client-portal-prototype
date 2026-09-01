'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { T, dash } from '@/components/ui/tokens';
import { colHeader, headerRow, bodyRow, emptyState, tableFooter } from '@/components/ui/table';
import { TableScroll } from '@/components/ui/TableScroll';
import type { AdminClientRow } from '@/lib/admin-views';

const GRID = '2fr 1fr 1fr 1fr 1.1fr 1.1fr 2.2fr';

type SortKey = 'name' | 'owed' | 'notStarted' | 'inFlight' | 'stalledWithUs' | 'waitingOnClient';

/** The plan line under the client's name: what kind of contract, and its trouble. */
function planLine(r: AdminClientRow): string {
  if (!r.periodId) return 'No contract yet';
  const kind = r.model === 'package' ? 'Package' : 'Retainer';
  if (r.termDaysLeft !== null && r.termDaysLeft < 0) return `${kind} · contract expired ${Math.abs(r.termDaysLeft)}d ago`;
  if (r.coverage && r.coverage.sold > 0) return `${kind} · ${r.coverage.delivered} of ${r.coverage.sold} delivered`;
  return `${kind} · active`;
}

/** Total still due on the contract, regardless of what stage it's in — distinct
 *  from "Not started," which is the subset of that total not yet in production. */
function owedCount(r: AdminClientRow): number | null {
  if (!r.coverage) return null;
  return Math.max(0, r.coverage.sold - r.coverage.delivered);
}

/** Same red/amber/green logic as ClientsTable.tsx's notStartedTone(). */
function notStartedTone(r: AdminClientRow): 'red' | 'amber' | 'green' {
  const cov = r.coverage!;
  if (cov.status === 'covered') return 'green';
  if (cov.status === 'over') return 'amber';
  return r.termExpired || r.stages.backlog === 0 ? 'red' : 'amber';
}

const TONE_COLOR: Record<'red' | 'amber' | 'green', string> = {
  red: T.danger, amber: '#B4762A', green: T.ok,
};

export function ByClientTable({ rows, inactiveCount }: { rows: AdminClientRow[]; inactiveCount: number }) {
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results = q ? rows.filter(r => r.name.toLowerCase().includes(q)) : rows;

    results.sort((a, b) => {
      let aVal: string | number;
      let bVal: string | number;

      switch (sortKey) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'owed':
          aVal = owedCount(a) ?? 0;
          bVal = owedCount(b) ?? 0;
          break;
        case 'notStarted':
          aVal = a.coverage?.notStarted ?? 0;
          bVal = b.coverage?.notStarted ?? 0;
          break;
        case 'inFlight':
          aVal = a.inFlight ?? 0;
          bVal = b.inFlight ?? 0;
          break;
        case 'stalledWithUs':
          aVal = a.stalledWithUs ?? 0;
          bVal = b.stalledWithUs ?? 0;
          break;
        case 'waitingOnClient':
          aVal = a.waitingOnClient ?? 0;
          bVal = b.waitingOnClient ?? 0;
          break;
      }

      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return results;
  }, [rows, query, sortKey, sortAsc]);

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
            width: 260, maxWidth: '100%', padding: '9px 12px', borderRadius: 9,
            border: `1px solid ${T.lineStrong}`, fontFamily: 'inherit', fontSize: 13, color: T.ink,
          }}
        />
      }
    >
      <TableScroll>
        <div style={{ ...headerRow(GRID), paddingTop: 4 }}>
          <button
            type="button"
            onClick={() => handleSort('name')}
            style={{
              ...colHeader,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Client
            {sortKey === 'name' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleSort('owed')}
            style={{
              ...colHeader,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Owed
            {sortKey === 'owed' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleSort('notStarted')}
            style={{
              ...colHeader,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Not started
            {sortKey === 'notStarted' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleSort('inFlight')}
            style={{
              ...colHeader,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            In flight
            {sortKey === 'inFlight' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleSort('stalledWithUs')}
            style={{
              ...colHeader,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Stuck with us
            {sortKey === 'stalledWithUs' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleSort('waitingOnClient')}
            style={{
              ...colHeader,
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            Waiting on client
            {sortKey === 'waitingOnClient' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
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
          <span style={{ fontSize: 15, fontWeight: owedCount(r) ? 700 : 600, color: owedCount(r) ? T.ink : T.ghost }}>{dash(owedCount(r))}</span>
          <span style={{ fontSize: 15, fontWeight: r.coverage?.notStarted ? 700 : 600, color: r.coverage?.notStarted ? TONE_COLOR[notStartedTone(r)] : T.ghost }}>{dash(r.coverage?.notStarted ?? null)}</span>
          <span style={{ fontSize: 15, fontWeight: 600, color: r.inFlight ? T.ink : T.ghost }}>{dash(r.inFlight)}</span>
          <span style={{ fontSize: 15, fontWeight: r.stalledWithUs ? 700 : 600, color: r.stalledWithUs ? T.brand : T.ghost }}>{dash(r.stalledWithUs)}</span>
          <span style={{ fontSize: 15, fontWeight: r.waitingOnClient ? 700 : 600, color: r.waitingOnClient ? '#B4762A' : T.ghost }}>{dash(r.waitingOnClient)}</span>
          <span style={{ fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{r.nextAction}</span>
          </Link>
        ))}
      </TableScroll>

      <div style={tableFooter}>
        {rows.length} active client{rows.length === 1 ? '' : 's'}
        {inactiveCount > 0 && ` · ${inactiveCount} inactive hidden`}
      </div>
    </Card>
  );
}
