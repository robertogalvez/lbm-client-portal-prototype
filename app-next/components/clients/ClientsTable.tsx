'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { CoverageBar } from '@/components/ui/Bars';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { T, MONO } from '@/components/ui/tokens';
import { colHeader, headerRow, bodyRow, emptyState } from '@/components/ui/table';
import { TableScroll } from '@/components/ui/TableScroll';
import { type AdminClientRow, type AdminFilterTag } from '@/lib/admin-views';

// CLIENT | CONTRACT | DELIVERY | BLOCKED ↓ | WHAT TO DO
const GRID = '2fr 1.5fr 2fr 1.2fr 3fr';

type SortKey = 'name' | 'contractTerm' | 'delivery' | 'blocked';

type FilterKey = 'all' | AdminFilterTag;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expired', label: 'Expired terms' },
  { key: 'nocontract', label: 'No contract' },
  { key: 'waiting', label: 'Waiting on client' },
];

function blockedTotal(r: AdminClientRow): number {
  return r.stalledWithUs + r.waitingOnClient;
}

// Active contracts first (0), no-contract clients second (1), expired last (2).
function statusGroup(r: AdminClientRow): number {
  if (r.termExpired) return 2;
  if (r.periodId === null) return 1;
  return 0;
}

export function ClientsTable({ rows }: { rows: AdminClientRow[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('blocked');
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === 'name');
    }
  };

  const counts = useMemo(() => ({
    all: rows.length,
    expired: rows.filter(r => r.filterTags.includes('expired')).length,
    nocontract: rows.filter(r => r.filterTags.includes('nocontract')).length,
    waiting: rows.filter(r => r.filterTags.includes('waiting')).length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results = rows
      .filter(r => filter === 'all' || r.filterTags.includes(filter))
      .filter(r => !q || r.name.toLowerCase().includes(q));

    results.sort((a, b) => {
      const groupDiff = statusGroup(a) - statusGroup(b);
      if (groupDiff !== 0) return groupDiff;

      let aVal: string | number;
      let bVal: string | number;

      switch (sortKey) {
        case 'name':
          aVal = a.name.toLowerCase();
          bVal = b.name.toLowerCase();
          break;
        case 'contractTerm':
          aVal = a.termText?.toLowerCase() ?? '';
          bVal = b.termText?.toLowerCase() ?? '';
          break;
        case 'delivery':
          aVal = a.coverage?.delivered ?? 0;
          bVal = b.coverage?.delivered ?? 0;
          break;
        case 'blocked':
          aVal = blockedTotal(a);
          bVal = blockedTotal(b);
          break;
      }

      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return results;
  }, [rows, filter, query, sortKey, sortAsc]);

  function SortButton({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <button
        type="button"
        onClick={() => handleSort(col)}
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
        {label}
        {active && <span>{sortAsc ? '↑' : '↓'}</span>}
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
          style={{ width: 300, maxWidth: '100%', padding: '11px 13px', borderRadius: 10, border: `1px solid ${T.lineStrong}`, fontFamily: 'inherit', fontSize: 13 }}
        />
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(f.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '11px 15px', borderRadius: 10, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                border: `1px solid ${active ? '#ffc09a' : T.lineStrong}`,
                background: active ? T.brandTint : T.surface,
                color: active ? T.brandDark : T.ink2,
              }}
            >
              {f.label}
              <span style={{
                fontSize: 11.5, fontWeight: 600, padding: '1px 6px', borderRadius: 6,
                background: active ? T.brandTint2 : T.dividerLight,
                color: active ? T.brandDark : T.ink3,
              }}>
                {counts[f.key]}
              </span>
            </button>
          );
        })}
      </div>

      <Card padded={false}>
        <TableScroll wide>
          <div style={{ minWidth: 860 }}>
            <div style={{ ...headerRow(GRID), padding: '4px 24px 12px' }}>
              <SortButton col="name" label="Client" />
              <SortButton col="contractTerm" label="Contract" />
              <SortButton col="delivery" label="Delivery" />
              <SortButton col="blocked" label="Blocked ↓" />
              <span style={colHeader}>What to do</span>
            </div>

            {filtered.length === 0 && <div style={emptyState}>No clients match this filter.</div>}

            {filtered.map(r => (
              <div key={r.id}>
                {/* Main row */}
                <div style={{ ...bodyRow(GRID), alignItems: 'start' }}>
                  {/* CLIENT */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <Avatar name={r.name} color={r.avatarColor} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
                        {r.model ?? 'no contract'}
                        {r.coverage && ` · ${r.coverage.delivered} of ${r.coverage.sold} delivered`}
                      </span>
                    </span>
                  </span>

                  {/* CONTRACT */}
                  <span>
                    <span style={{ display: 'block', fontFamily: MONO, fontSize: 12, color: T.ink2, whiteSpace: 'nowrap' }}>{r.termText}</span>
                    <span style={{ display: 'inline-flex', marginTop: 6 }}>
                      <StatusBadge tone={r.periodId ? r.expiryTone : 'amber'} dot={false}>
                        {r.periodId ? r.expiryText : 'Needs setup'}
                      </StatusBadge>
                    </span>
                  </span>

                  {/* DELIVERY */}
                  <span style={{ minWidth: 0 }}>
                    {r.coverage ? (
                      <>
                        <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, color: T.ink2 }}>
                          <span>{r.coverage.delivered} / {r.coverage.sold}</span>
                          {!r.termExpired && (r.coverage?.notStarted ?? 0) > 0 && (
                            <span style={{ fontSize: 11.5, color: T.danger }}>{r.coverage!.notStarted} not started</span>
                          )}
                        </span>
                        <span style={{ display: 'block', marginTop: 7 }}>
                          <CoverageBar
                            sold={r.coverage.sold}
                            delivered={r.coverage.delivered - r.scheduledAhead}
                            scheduled={r.scheduledAhead}
                            inPipeline={r.coverage.inPipeline}
                            height={7}
                          />
                        </span>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: T.ink3, fontStyle: 'italic' }}>No contracted scope</span>
                    )}
                  </span>

                  {/* BLOCKED */}
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
                    {r.waitingOnClient > 0 && (
                      <StatusBadge tone="amber" dot={false}>{r.waitingOnClient} on client</StatusBadge>
                    )}
                    {r.stalledWithUs > 0 && (
                      <StatusBadge tone="red" dot={false}>{r.stalledWithUs} on us</StatusBadge>
                    )}
                    {r.waitingOnClient === 0 && r.stalledWithUs === 0 && (
                      <StatusBadge tone="slate" dot={false}>nothing blocked</StatusBadge>
                    )}
                  </span>

                  {/* WHAT TO DO */}
                  <span style={{ display: 'flex', gap: 10, alignItems: 'flex-start', minWidth: 0 }}>
                    <span style={{ flex: 1, fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{r.nextAction}</span>
                    <Link
                      href={r.periodId ? `/admin/clients/${r.periodId}` : `/admin/clients?client=${r.clientId}`}
                      style={{ fontSize: 12, fontWeight: 600, color: T.brand, textDecoration: 'none', whiteSpace: 'nowrap', marginTop: 1 }}
                    >
                      Open →
                    </Link>
                  </span>
                </div>

                {/* Stage pills — always visible, ordered by production workflow */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  padding: '8px 24px 12px 60px',
                  borderTop: `1px solid ${T.dividerLight}`,
                }}>
                  {!r.termExpired && (r.coverage?.notStarted ?? 0) > 0 && <StatusBadge tone="red" dot={false}>{r.coverage!.notStarted} not started</StatusBadge>}
                  {r.stages.backlog > 0 && <StatusBadge tone="slate" dot={false}>{r.stages.backlog} in backlog</StatusBadge>}
                  {r.stages.editing > 0 && <StatusBadge tone="blue" dot={false}>{r.stages.editing} editing</StatusBadge>}
                  {r.stages.qc > 0 && <StatusBadge tone="blue" dot={false}>{r.stages.qc} in QC</StatusBadge>}
                  {r.stages.review > 0 && <StatusBadge tone="amber" dot={false}>{r.stages.review} in review</StatusBadge>}
                  {(r.stages.ready - r.scheduledAhead) > 0 && <StatusBadge tone="blue" dot={false}>{r.stages.ready - r.scheduledAhead} not scheduled</StatusBadge>}
                  {r.scheduledAhead > 0 && <StatusBadge tone="green" dot={false}>{r.scheduledAhead} scheduled</StatusBadge>}
                  {r.coverage && (r.coverage.delivered - r.scheduledAhead) > 0 && <StatusBadge tone="green" dot={false}>{r.coverage.delivered - r.scheduledAhead} posted live</StatusBadge>}
                  {r.unclassified > 0 && (
                    <span title={`ClickUp status not mapped: ${r.unclassifiedStatuses.join(', ')}`}>
                      <StatusBadge tone="red" dot={false}>{r.unclassified} unmapped</StatusBadge>
                    </span>
                  )}
                  {r.stages.review === 0 && r.stages.editing === 0 && r.stages.qc === 0 && r.stages.backlog === 0 && r.stages.ready === 0 && r.scheduledAhead === 0 && r.unclassified === 0 && !r.coverage && (
                    <span style={{ fontSize: 12, color: T.ink3 }}>Nothing in flight</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TableScroll>
      </Card>
    </div>
  );
}
