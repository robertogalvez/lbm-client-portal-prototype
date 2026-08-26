'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { ProgressBar } from '@/components/ui/Bars';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { T, MONO } from '@/components/ui/tokens';
import { colHeader, headerRow, bodyRow, emptyState } from '@/components/ui/table';
import { TableScroll } from '@/components/ui/TableScroll';
import type { AdminClientRow, AdminFilterTag } from '@/lib/admin-views';

const GRID = '2.2fr 1.6fr 1.5fr 1.4fr 2.2fr';

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

export function AccountsTab({ rows, inactiveCount }: { rows: AdminClientRow[]; inactiveCount: number }) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

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
    return rows
      .filter(r => filter === 'all' || r.filterTags.includes(filter))
      .filter(r => !q || r.name.toLowerCase().includes(q));
  }, [rows, filter, query]);

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
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: T.ink3 }}>
          {filtered.length} of {rows.length} active
          {inactiveCount > 0 && ` · ${inactiveCount} inactive hidden`}
        </span>
      </div>

      <Card padded={false}>
        <TableScroll>
        <div style={{ ...headerRow(GRID), padding: '4px 24px 12px' }}>
          <span style={colHeader}>Client</span>
          <span style={colHeader}>Contract term</span>
          <span style={colHeader}>Delivered</span>
          <span style={colHeader}>In flight</span>
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
                  <span style={{ display: 'block', fontSize: 13, color: T.ink2 }}>
                    {r.coverage.delivered} of {r.coverage.sold}
                    {r.fulfilmentPct !== null && ` · ${Math.round(r.fulfilmentPct)}%`}
                  </span>
                  <span style={{ display: 'block', marginTop: 7, maxWidth: 108 }}>
                    <ProgressBar
                      pct={r.fulfilmentPct ?? 0}
                      color={(r.fulfilmentPct ?? 0) >= 30 ? '#B4762A' : T.brand}
                    />
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
