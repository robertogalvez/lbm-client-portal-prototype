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
import type { AdminClientRow, AdminFilterTag } from '@/lib/admin-views';
import type { PaceNeeded } from '@/lib/contracts';

const GRID = '2fr 1.4fr 1.6fr 1.7fr 1.5fr 2fr';

type SortKey = 'name' | 'contractTerm' | 'coverage' | 'inFlight' | 'paceNeeded';

type FilterKey = 'all' | AdminFilterTag;

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'expired', label: 'Expired terms' },
  { key: 'nocontract', label: 'No contract' },
  { key: 'waiting', label: 'Waiting on client' },
];

/** In-flight reads as stacked chips, one per stage that actually has work in it. */
function inFlightChips(r: AdminClientRow) {
  const parts: { label: string; tone: 'amber' | 'blue' | 'slate' | 'red'; title?: string }[] = [];
  if (r.stages.review) parts.push({ label: `${r.stages.review} in review`, tone: 'amber' });
  if (r.stages.editing) parts.push({ label: `${r.stages.editing} editing`, tone: 'blue' });
  if (r.stages.qc) parts.push({ label: `${r.stages.qc} in QC`, tone: 'blue' });
  if (r.stages.backlog) parts.push({ label: `${r.stages.backlog} in backlog`, tone: 'slate' });
  if (r.stages.ready) parts.push({ label: `${r.stages.ready} ready to post`, tone: 'blue' });
  // A ClickUp status this app doesn't recognise (a renamed or added column).
  // Flagged rather than dropped — see lib/pipeline.ts's unclassified bucket.
  if (r.unclassified) {
    parts.push({
      label: `${r.unclassified} unclassified`,
      tone: 'red',
      title: `ClickUp status not mapped to a stage: ${r.unclassifiedStatuses.join(', ')}`,
    });
  }
  if (parts.length === 0) parts.push({ label: 'nothing in flight', tone: 'slate' });
  return parts;
}

/**
 * The actionable field, and the reason this screen does not show
 * percent-delivered: a percentage cannot tell you whether the remainder is in
 * production or does not exist yet, and a pace figure is meaningless without
 * a deadline — so an expired term states the contractual problem instead.
 */
function paceText(pace: PaceNeeded | null, r: AdminClientRow): string {
  if (!pace) return '—';
  switch (pace.kind) {
    case 'covered':
      return r.coverage?.status === 'over'
        ? `${r.coverage.over} over contract${r.termExpired ? ', term expired' : ''}`
        : 'Covered — just keep it moving';
    case 'pace':
      return `${pace.perWeek} / week to finish on time`;
    case 'open':
      return `${pace.remaining} to brief · no deadline to pace against`;
    case 'blocked':
      return r.termExpired
        ? `Contract ended, ${pace.remaining} still owed`
        : `No term on file, ${pace.remaining} still owed`;
    case 'cycle-pending':
      // The deadline is known in length but not yet in date, so there is no
      // pace to quote — publishing the first video is what starts the clock.
      return `${pace.remaining} to start · ${pace.durationDays}-day clock starts at first publish`;
  }
}

function notStartedTone(r: AdminClientRow): 'red' | 'amber' | 'green' {
  const cov = r.coverage!;
  if (cov.status === 'covered') return 'green';
  if (cov.status === 'over') return 'amber';
  return r.termExpired || r.stages.backlog === 0 ? 'red' : 'amber';
}

/**
 * Screen 2 — one table answering both "which accounts are at risk?" and "do
 * we have enough videos in motion to honour what we sold?" Used to be two
 * tabs (Accounts / Coverage) that read the same AdminClientRow[] and mostly
 * repeated each other — Accounts' "Contract term" badge already said what
 * Coverage's separate "Term left" column said, just phrased differently, and
 * Coverage's sold/delivered/in-progress rollup was a coarser view of the
 * exact pipeline Accounts' stage chips already broke out granularly. One row
 * now carries both altitudes instead of making you flip tabs to see if an
 * at-risk client is also short on coverage.
 */
export function ClientsTable({ rows }: { rows: AdminClientRow[] }) {
  const [filter, setFilter] = useState<FilterKey>('all');
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

  const counts = useMemo(() => ({
    all: rows.length,
    expired: rows.filter(r => r.filterTags.includes('expired')).length,
    nocontract: rows.filter(r => r.filterTags.includes('nocontract')).length,
    waiting: rows.filter(r => r.filterTags.includes('waiting')).length,
  }), [rows]);

  // The chips in the old portal were decorative — they had counts but did not
  // filter anything. They filter now, and the count on the right follows them.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const results = rows
      .filter(r => filter === 'all' || r.filterTags.includes(filter))
      .filter(r => !q || r.name.toLowerCase().includes(q));

    results.sort((a, b) => {
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
        case 'coverage':
          aVal = a.coverage?.delivered ?? 0;
          bVal = b.coverage?.delivered ?? 0;
          break;
        case 'inFlight': {
          const aFlight = a.stages.review + a.stages.editing + a.stages.qc + a.stages.backlog + a.stages.ready;
          const bFlight = b.stages.review + b.stages.editing + b.stages.qc + b.stages.backlog + b.stages.ready;
          aVal = aFlight;
          bVal = bFlight;
          break;
        }
        case 'paceNeeded':
          aVal = a.pace?.perWeek ?? (a.pace?.remaining ?? 0);
          bVal = b.pace?.perWeek ?? (b.pace?.remaining ?? 0);
          break;
      }

      if (typeof aVal === 'string') {
        return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      }
      return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return results;
  }, [rows, filter, query, sortKey, sortAsc]);

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
        <div style={{ ...headerRow(GRID), padding: '4px 24px 12px' }}>
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
            onClick={() => handleSort('contractTerm')}
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
            Contract term
            {sortKey === 'contractTerm' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <button
            type="button"
            onClick={() => handleSort('coverage')}
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
            Coverage
            {sortKey === 'coverage' && <span>{sortAsc ? '↑' : '↓'}</span>}
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
            onClick={() => handleSort('paceNeeded')}
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
            Pace needed
            {sortKey === 'paceNeeded' && <span>{sortAsc ? '↑' : '↓'}</span>}
          </button>
          <span style={colHeader}>What to do</span>
        </div>

        {filtered.length === 0 && <div style={emptyState}>No clients match this filter.</div>}

        {filtered.map(r => (
          <Link
            key={r.id}
            href={r.periodId ? `/admin/clients/${r.periodId}` : `/admin/clients?client=${r.clientId}`}
            style={{ ...bodyRow(GRID), alignItems: 'start', textDecoration: 'none', color: 'inherit' }}
            className="db-row-link"
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <Avatar name={r.name} color={r.avatarColor} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 2 }}>
                  {r.model ?? 'no contract'}
                  {r.fulfilmentPct !== null && ` · ${Math.round(r.fulfilmentPct)}% delivered`}
                </span>
              </span>
            </span>

            <span>
              <span style={{ display: 'block', fontFamily: MONO, fontSize: 12, color: T.ink2 }}>{r.termText}</span>
              <span style={{ display: 'inline-flex', marginTop: 6 }}>
                <StatusBadge tone={r.periodId ? r.expiryTone : 'amber'} dot={false}>
                  {r.periodId ? r.expiryText : 'Needs setup'}
                </StatusBadge>
              </span>
            </span>

            <span>
              {r.coverage ? (
                <>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.ink2 }}>
                    {r.coverage.delivered} of {r.coverage.sold}
                    <StatusBadge tone={notStartedTone(r)} dot={false}>
                      {r.coverage.status === 'short' ? `+${r.coverage.notStarted} to start` : r.coverage.status === 'over' ? `${r.coverage.over} over` : 'none'}
                    </StatusBadge>
                  </span>
                  <span style={{ display: 'block', marginTop: 7, maxWidth: 140 }}>
                    <CoverageBar sold={r.coverage.sold} delivered={r.coverage.delivered} inPipeline={r.coverage.inPipeline} />
                  </span>
                </>
              ) : (
                <span style={{ fontSize: 15, color: T.ghost }}>—</span>
              )}
            </span>

            <span style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-start' }}>
              {inFlightChips(r).map(c => (
                <span key={c.label} title={c.title}>
                  <StatusBadge tone={c.tone} dot={false}>{c.label}</StatusBadge>
                </span>
              ))}
            </span>

            <span style={{ fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{paceText(r.pace, r)}</span>

            <span style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ flex: 1, fontSize: 13, color: T.ink2, lineHeight: 1.45 }}>{r.nextAction}</span>
              <span aria-hidden style={{ color: T.ghost, fontSize: 15, lineHeight: 1.2 }}>›</span>
            </span>
          </Link>
        ))}
        </TableScroll>
      </Card>
    </div>
  );
}
