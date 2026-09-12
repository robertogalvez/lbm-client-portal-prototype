'use client';

import { useCallback, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { CoverageBar, CoverageLegend } from '@/components/ui/Bars';
import { T, MONO, COVERAGE_COLORS } from '@/components/ui/tokens';
import { ContractChannelsDrawer } from '@/components/shared/ContractChannelsDrawer';
import { PLATFORMS } from '@/lib/socialLinks';
import { fmtCalendarDate } from '@/lib/calendar-date';
import { normalizeLogoFile, LogoUploadError } from '@/lib/logo-upload';
import type { ClientDetailData, LedgerRow, PortalUser } from '@/lib/client-detail';

const ALL_STATUSES = '__all__';

const TONE_COLOR: Record<LedgerRow['tone'], string> = {
  ok: T.ok, warn: T.warn, danger: '#B23A0C', info: T.info, mute: T.ink3,
};

const LEDGER_SCOPES = [
  { value: 'waiting' as const, label: 'Waiting on client' },
  { value: 'all' as const, label: 'All' },
  { value: 'published' as const, label: 'Published' },
];

const TYPE_LABEL: Record<LedgerRow['deliverableType'], string> = {
  short_form: 'SF', youtube: 'YT', ad: 'AD',
};

/** How many ledger rows before paging. The card sits beside a three-card rail
 *  and used to run several screens past it on an account with any history. */
const PAGE_SIZE = 8;

type Scope = 'all' | 'waiting' | 'published';

function inScope(r: LedgerRow, scope: Scope): boolean {
  if (scope === 'waiting') return r.waitingOnClient;
  if (scope === 'published') return r.published;
  return true;
}

// Ledger rows carry a real timestamp (when a task last moved), not a stored
// calendar date, so ordinary locale formatting is fine here — this is not
// the date-off-by-one class of bug (see lib/calendar-date.ts).
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }) : 'No date recorded';

function isValidClickUpTaskId(id: string | null): boolean {
  return !!id && /^[a-z0-9]+$/i.test(id);
}

/**
 * Screen 3 — "what do I change on this account?"
 *
 * Opens with one banner and one primary action, replacing the six-stat strip
 * this page used to lead with (all of it recomputable from the ledger, and
 * one stat, "Beyond contract −39", read as an error). The Contract scope,
 * Deliverable mix and Footage supply cards are gone with it: the first
 * repeated the page header, and the other two rendered fields for data the
 * system does not hold.
 */
export function ClientDetailView({ data: initial }: { data: ClientDetailData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // "Waiting on client" leads, because it is the only part of the ledger that
  // needs a decision today — but opening on an empty table would be worse than
  // the wrong tab, so an account with nothing waiting starts on All.
  const [scope, setScope] = useState<Scope>(
    () => initial.ledger.some(r => !r.archived && inScope(r, 'waiting')) ? 'waiting' : 'all',
  );
  const [showArchived, setShowArchived] = useState(false);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);
  const [page, setPage] = useState(0);
  const [syncOpen, setSyncOpen] = useState(false);
  const [tab, setTab] = useState<'ledger' | 'inventory'>('ledger');
  const [inventoryStatusFilter, setInventoryStatusFilter] = useState(ALL_STATUSES);

  const { row, displayName, ledger, portal } = data;
  const cov = row.coverage;
  const firstName = displayName.split(' ')[0];

  // Distinct ClickUp statuses present on this account, in pipeline order
  // (the ledger is already sorted that way) — lets an admin see every video
  // sitting on one exact status, not just the coarse waiting/all/published split.
  const statusOptions = [...new Set(ledger.map(r => r.status))];

  const refresh = useCallback(async () => {
    const res = await fetch(`/api/dashboard/client-detail?id=${row.periodId}`);
    if (res.ok) setData(await res.json());
    router.refresh();
  }, [row.periodId, router]);

  const archivedCount = ledger.filter(r => r.archived).length;
  const scoped = ledger.filter(r =>
    (showArchived || !r.archived) && inScope(r, scope) && (statusFilter === ALL_STATUSES || r.status === statusFilter),
  );
  const pageCount = Math.max(1, Math.ceil(scoped.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visibleLedger = scoped.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function changeScope(next: Scope) {
    setScope(next);
    setPage(0); // page 3 of the old filter is meaningless under the new one
  }

  // Inventory: all tasks (including archived, dimmed) grouped by status bucket.
  const inventoryRows = ledger.filter(r =>
    inventoryStatusFilter === ALL_STATUSES || r.status === inventoryStatusFilter,
  );
  const inventoryGroups: [string, LedgerRow[]][] = [];
  for (const r of inventoryRows) {
    const last = inventoryGroups[inventoryGroups.length - 1];
    if (last && last[0] === r.status) last[1].push(r);
    else inventoryGroups.push([r.status, [r]]);
  }

  const channels = PLATFORMS
    .map(p => ({ ...p, link: data.socialLinks?.[p.key] }))
    .filter(p => p.link?.url || p.link?.handle);

  return (
    <main style={{ maxWidth: 1400 }}>
      <PageHeader
        title={
          <>
            <Link href="/admin/clients" style={{ color: T.ink3, textDecoration: 'none' }}>Clients</Link>
            <span style={{ color: T.ghost }}> / </span>
            {displayName}
          </>
        }
        subtitle={`${row.model === 'package' ? 'Package' : 'Retainer'} contract · ${row.termText}`}
      />

      <div className="db-page-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Identity */}
        <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, padding: '22px 24px', display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <Avatar name={displayName} color={row.avatarColor} size={52} radius={12} />
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: '-0.015em', color: T.ink }}>{displayName}</span>
              {(row.termExpired || row.stalledWithUs > 0 || row.waitingOnClient > 0) && (
                <StatusBadge tone={row.termExpired ? 'red' : 'amber'} dot={false}>Needs attention</StatusBadge>
              )}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: T.ink2, marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 8px' }}>
              <span>{row.model === 'package' ? 'Package' : 'Retainer'}</span>
              <span style={{ color: T.lineStrong }}>·</span>
              <span>{cov ? `${cov.sold} deliverables` : 'no contract'}</span>
              <span style={{ color: T.lineStrong }}>·</span>
              <span>{row.termText}</span>
              {row.term.kind === 'cycle' && (
                <>
                  <span style={{ color: T.lineStrong }}>·</span>
                  <span>{row.termDaysLeft !== null && row.termDaysLeft < 0 ? `ended ${Math.abs(row.termDaysLeft)}d ago` : `${row.termDaysLeft}d left`}</span>
                </>
              )}
            </div>
            {/* The cycle clock starts at the first published video, not at the
                contract's start date — say so, or the window looks arbitrary. */}
            {row.term.kind === 'cycle' && (
              <div style={{ fontSize: 12, color: T.ink3, marginTop: 6 }}>
                Cycle started {fmtCalendarDate(row.term.anchorDate)} — the first video published on this contract.
              </div>
            )}
            {row.term.kind === 'cycle-pending' && (
              <div style={{ fontSize: 12, color: T.warn, marginTop: 6 }}>
                {row.term.durationDays}-day cycle — the clock starts when the first video is published.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="outline" onClick={async () => {
              const res = await fetch('/api/admin/view-as', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: row.clientId }),
              });
              if (res.ok) window.location.assign('/client');
            }}>
              View as client
            </Button>
            <Button variant="dark" onClick={() => setDrawerOpen(true)}>Edit contract &amp; channels</Button>
          </div>
        </div>

        {/* Tab switcher: Ledger (triage) vs Inventory (full list) */}
        <div style={{ display: 'flex', gap: 6 }}>
          {(['ledger', 'inventory'] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              style={{
                padding: '8px 16px', borderRadius: 8, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                border: `1px solid ${tab === t ? T.brand : T.lineStrong}`,
                background: tab === t ? T.brandTint : T.surface,
                color: tab === t ? T.brandDark : T.ink2,
              }}
            >
              {t === 'ledger' ? 'Ledger' : 'Inventory'}
            </button>
          ))}
        </div>

        {tab === 'inventory' && (
          <Card
            title="Video inventory"
            subtitle={`${inventoryRows.length} video${inventoryRows.length === 1 ? '' : 's'} · grouped by status`}
            padded={false}
            action={
              <select
                aria-label="Filter by status"
                value={inventoryStatusFilter}
                onChange={e => setInventoryStatusFilter(e.target.value)}
                style={{
                  padding: '6px 10px', borderRadius: 7, border: `1px solid ${T.lineStrong}`,
                  background: T.surface, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
                  color: T.ink2, cursor: 'pointer',
                }}
              >
                <option value={ALL_STATUSES}>All statuses</option>
                {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            }
          >
            {inventoryRows.length === 0 && (
              <div style={{ padding: '30px 24px', fontSize: 13, color: T.ink3, textAlign: 'center' }}>No videos on this account yet.</div>
            )}
            {inventoryGroups.map(([status, rows]) => (
              <div key={status}>
                {/* Status group header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 24px', background: '#f8f9fb',
                  borderTop: `1px solid ${T.dividerLight}`,
                }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.ink3 }}>{status}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: T.dividerLight, color: T.ink3 }}>{rows.length}</span>
                </div>
                {rows.map(v => (
                  <div
                    key={v.id}
                    style={{
                      display: 'grid', gridTemplateColumns: 'auto 2fr 1fr 170px', gap: 12, alignItems: 'center',
                      padding: '11px 24px', borderTop: `1px solid ${T.dividerLight}`,
                      opacity: v.archived ? 0.45 : 1,
                    }}
                  >
                    {/* Type badge */}
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                      background: T.dividerLight, color: T.ink3, whiteSpace: 'nowrap', letterSpacing: '0.03em',
                    }}>
                      {TYPE_LABEL[v.deliverableType]}
                    </span>
                    {/* Title */}
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
                    {/* Date: publish date preferred, fall back to dateUpdated */}
                    <span style={{ fontFamily: MONO, fontSize: 11.5, color: T.ink3 }}>
                      {v.publishDate
                        ? <span title="Publish date">{fmtDate(v.publishDate)}</span>
                        : <span title="Last updated in ClickUp">{fmtDate(v.date)}</span>}
                    </span>
                    {/* Links */}
                    <span style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                      {v.clickupUrl && (
                        <a href={v.clickupUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: T.ink3, textDecoration: 'none' }}>CU ↗</a>
                      )}
                      {v.frameLink && (
                        <a href={v.frameLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: T.brand, textDecoration: 'none' }}>F.io ↗</a>
                      )}
                      {v.instagramUrl && (
                        <a href={v.instagramUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#E1306C', textDecoration: 'none' }}>
                          {v.deliverableType === 'youtube' ? 'YT ↗' : 'IG ↗'}
                        </a>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </Card>
        )}

        {tab === 'ledger' && <div className="db-detail-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* Same formula, colours and wording as the Coverage tab — this is
                the per-account view of it, computed by the same selector.
                `row.scheduledAhead` splits the delivered bar into "live" (already
                posted) and "scheduled" (POSTED IN SOCIALS with a future date),
                so the AM sees the same three numbers they track in their inventory
                sheet (live · scheduled · pending review) rather than a combined
                "in progress" that masks what's actually happening. */}
            {cov && (() => {
              const liveDelivered = cov.delivered - row.scheduledAhead;
              const covStats = [
                { n: liveDelivered,       label: 'posted live',      color: COVERAGE_COLORS.delivered },
                ...(row.scheduledAhead > 0
                  ? [{ n: row.scheduledAhead, label: 'scheduled',    color: COVERAGE_COLORS.scheduled }]
                  : []),
                ...(cov.inPipeline > 0
                  ? [{ n: cov.inPipeline,     label: 'in production', color: COVERAGE_COLORS.inPipeline }]
                  : []),
                { n: cov.status === 'over' ? cov.over : cov.notStarted, label: cov.status === 'over' ? 'over contract' : 'not started', color: T.brand },
                { n: cov.sold,            label: 'deliverables',     color: T.ink },
              ];
              return (
                <Card
                  title="Contract coverage"
                  subtitle={row.termText}
                  action={<span style={{ fontFamily: MONO, fontSize: 12, color: T.ink3 }}>{cov.delivered + cov.inPipeline} of {cov.sold} accounted for</span>}
                >
                  <CoverageBar
                    sold={cov.sold}
                    delivered={liveDelivered}
                    scheduled={row.scheduledAhead}
                    inPipeline={cov.inPipeline}
                    height={10}
                  />
                  <div style={{ marginTop: 12 }}>
                    <CoverageLegend showScheduled={row.scheduledAhead > 0} />
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 26, marginTop: 18 }}>
                    {covStats.map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: s.color }}>{s.n}</div>
                        <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>{s.label}</div>
                      </div>
                    ))}
                    {data.firstPassCleanPct !== null && (
                      <div title="Share of delivered videos approved on the first review round with no revisions needed">
                        <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: T.ink }}>{data.firstPassCleanPct}%</div>
                        <div style={{ fontSize: 12, color: T.ink3, marginTop: 2 }}>first pass clean</div>
                      </div>
                    )}
                  </div>

                </Card>
              );
            })()}

            <Card
              title="Video ledger"
              subtitle={`${scoped.length} video${scoped.length === 1 ? '' : 's'} · by status`}
              padded={false}
              action={
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <SegmentedControl label="Ledger scope" options={LEDGER_SCOPES} value={scope} onChange={changeScope} />
                  <select
                    aria-label="Filter by ClickUp status"
                    value={statusFilter}
                    onChange={e => { setStatusFilter(e.target.value); setPage(0); }}
                    style={{
                      padding: '6px 10px', borderRadius: 7, border: `1px solid ${T.lineStrong}`,
                      background: T.surface, fontFamily: 'inherit', fontSize: 12.5, fontWeight: 500,
                      color: T.ink2, cursor: 'pointer',
                    }}
                  >
                    <option value={ALL_STATUSES}>All statuses</option>
                    {statusOptions.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {archivedCount > 0 && (
                    <button
                      type="button"
                      aria-pressed={showArchived}
                      onClick={() => { setShowArchived(v => !v); setPage(0); }}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600,
                        color: showArchived ? T.brand : T.ink3,
                      }}
                    >
                      {showArchived ? 'Hide' : 'Show'} {archivedCount} archived
                    </button>
                  )}
                </div>
              }
            >
              {visibleLedger.length === 0 && (
                <div style={{ padding: '30px 24px', fontSize: 13, color: T.ink3, textAlign: 'center' }}>
                  {scope === 'waiting' ? `Nothing is waiting on ${firstName}.` : 'Nothing in this view.'}
                </div>
              )}
              {visibleLedger.map(v => (
                <div
                  key={v.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 130px', gap: 12, alignItems: 'center',
                    padding: '13px 24px', borderTop: `1px solid ${T.dividerLight}`,
                  }}
                >
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: v.archived ? T.ink3 : T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.title}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: TONE_COLOR[v.tone] }}>{v.stateLabel}</span>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: T.ink3 }}>{fmtDate(v.date)}</span>
                  <span style={{ textAlign: 'right', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    {v.clickupUrl && (
                      <a href={v.clickupUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: T.ink3, textDecoration: 'none' }}>CU ↗</a>
                    )}
                    {v.frameLink && (
                      <a href={v.frameLink} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: T.brand, textDecoration: 'none' }}>F.io ↗</a>
                    )}
                  </span>
                </div>
              ))}

              {pageCount > 1 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                  padding: '14px 24px 4px', borderTop: `1px solid ${T.dividerLight}`,
                }}>
                  <span style={{ flex: 1, fontSize: 12, color: T.ink3 }}>
                    {safePage * PAGE_SIZE + 1}–{Math.min(scoped.length, (safePage + 1) * PAGE_SIZE)} of {scoped.length}
                  </span>
                  <Button size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Next</Button>
                </div>
              )}
            </Card>
          </div>

          {/* Right rail */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Card title="Channels">
              {channels.length === 0 && <p style={{ fontSize: 13, color: T.ink3, margin: 0 }}>No channels connected yet.</p>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {channels.map(c => (
                  <div key={c.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, background: c.color, color: '#fff', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }} aria-hidden>{c.label[0]}</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: T.ink }}>{c.label}</span>
                      <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.link?.handle ?? c.link?.url}</span>
                    </span>
                    {c.link?.url && (
                      <a href={c.link.url} target="_blank" rel="noreferrer" aria-label={`Open ${c.label}`} style={{ color: T.ink3, textDecoration: 'none', fontSize: 14 }}>↗</a>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <BrandingCard
              clientId={row.clientId}
              logoUrl={data.logoUrl}
              onChanged={url => setData(d => ({ ...d, logoUrl: url }))}
            />

            {portal && (
              <PortalCard
                clientId={row.clientId}
                clientName={displayName}
                users={portal.portalUsers}
                initialToggles={{
                  showCalendar: portal.showCalendar,
                  showInvoices: portal.showInvoices,
                  showReport: portal.showReport,
                  notifyEmail: portal.notifyEmail,
                }}
                onChanged={refresh}
              />
            )}

            <Card>
              <button
                type="button"
                onClick={() => setSyncOpen(o => !o)}
                aria-expanded={syncOpen}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                <span style={{ flex: 1, textAlign: 'left', fontSize: 15, fontWeight: 600, color: T.ink }}>Sync &amp; danger zone</span>
                <span aria-hidden style={{ fontSize: 10, color: T.ink3 }}>{syncOpen ? '▲' : '▼'}</span>
              </button>
              {portal?.lastSyncedAt && (
                <div style={{ fontFamily: MONO, fontSize: 11.5, color: T.ink3, marginTop: 6 }}>
                  Last synced from ClickUp {new Date(portal.lastSyncedAt).toLocaleString()}
                </div>
              )}

              {syncOpen && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {isValidClickUpTaskId(data.clickupTaskId) && (
                    <a href={`https://app.clickup.com/t/${data.clickupTaskId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 600, color: T.brand, textDecoration: 'none' }}>
                      Open in ClickUp →
                    </a>
                  )}
                  {/* Mirroring these fields here was six rows, five of them
                      empty dashes — one link out says more. */}
                  <p style={{ fontSize: 12.5, color: T.ink3, lineHeight: 1.5, margin: 0 }}>
                    Contact, email, phone, Frame.io and Vista Social IDs all live in ClickUp. Mirroring empty fields here only added noise.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(`Delete "${displayName}"? This cannot be undone, and it will reappear on the next ClickUp sync if it is still Active/Inactive there.`)) return;
                      const res = await fetch(`/api/admin/clients/${row.clientId}`, { method: 'DELETE' });
                      if (res.ok) router.push('/admin/clients');
                      else alert('Failed to delete this client.');
                    }}
                    style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: T.destructive }}
                  >
                    Delete client
                  </button>
                </div>
              )}
            </Card>
          </div>
        </div>}
      </div>

      {drawerOpen && <ContractChannelsDrawer
        open
        onClose={() => setDrawerOpen(false)}
        clientId={row.clientId}
        clientName={displayName}
        periods={data.periods}
        socialLinks={data.socialLinks}
        coverageOnCurrent={row.periodId && cov ? { periodId: row.periodId, coverage: cov } : undefined}
        deliveredByPeriod={data.deliveredByPeriod}
        onSaved={refresh}
      />}
    </main>
  );
}

function BrandingCard({
  clientId, logoUrl, onChanged,
}: {
  clientId: string;
  logoUrl: string | null;
  onChanged: (url: string | null) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function save(next: string | null) {
    setError('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logoUrl: next }),
      });
      if (!res.ok) throw new Error();
      onChanged(next);
    } catch {
      setError('Could not save the logo.');
    }
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const dataUrl = await normalizeLogoFile(file);
      await save(dataUrl);
    } catch (err) {
      setError(err instanceof LogoUploadError ? err.message : 'Could not process this image.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card title="Branding">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* Every logo sits on the same neutral white chip regardless of its
            own background — real client logos arrive as opaque black- or
            white-background rectangles, not transparent art, so rendering
            straight onto a colored surface would clash. object-fit: contain
            inside this fixed box scales any aspect ratio to fit without
            cropping or distortion. */}
        <div style={{
          height: 44, width: 110, borderRadius: 10, background: '#fff',
          border: `1px solid ${T.line}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '6px 10px', flexShrink: 0,
        }}>
          {logoUrl
            ? <img src={logoUrl} alt="Client logo" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain' }} />
            : <span style={{ fontSize: 11, color: T.ink3 }}>No logo</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12.5, fontWeight: 600, color: T.brand, cursor: uploading ? 'default' : 'pointer' }}>
            {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleFile}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
          {logoUrl && (
            <button
              type="button"
              onClick={() => save(null)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: T.destructive, textAlign: 'left' }}
            >
              Remove logo
            </button>
          )}
        </div>
      </div>
      <p style={{ fontSize: 12, color: T.ink3, lineHeight: 1.5, margin: '10px 0 0' }}>
        PNG, JPG, WebP or SVG — any size or shape works, it&apos;s scaled to fit the portal header.
      </p>
      {error && <div style={{ fontSize: 12, color: T.danger, marginTop: 8 }}>{error}</div>}
    </Card>
  );
}

interface PortalToggles {
  showCalendar: boolean;
  showInvoices: boolean;
  showReport: boolean;
  notifyEmail: boolean;
}

const TOGGLE_LABELS: { key: keyof PortalToggles; label: string }[] = [
  { key: 'showCalendar', label: 'Publishing calendar' },
  { key: 'showInvoices', label: 'Invoices' },
  { key: 'showReport', label: 'Posted-on-socials report' },
  { key: 'notifyEmail', label: 'Review-ready notifications' },
];

function PortalCard({
  clientId, clientName, users, initialToggles, onChanged,
}: {
  clientId: string;
  clientName: string;
  users: PortalUser[];
  initialToggles: PortalToggles;
  onChanged: () => void;
}) {
  const [toggles, setToggles] = useState(initialToggles);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invName, setInvName] = useState('');
  const [invEmail, setInvEmail] = useState('');
  const [msg, setMsg] = useState('');

  // Optimistic: the switch moves immediately and rolls back if the write
  // fails, rather than making the admin wait on a round trip per toggle.
  async function setToggle(key: keyof PortalToggles, next: boolean) {
    const previous = toggles;
    const optimistic = { ...toggles, [key]: next };
    setToggles(optimistic);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(optimistic),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      setToggles(previous);
      setMsg('Could not save that setting.');
    }
  }

  async function saveUserSms(userId: string, next: boolean) {
    setMsg('');
    try {
      const res = await fetch(`/api/admin/portal-user/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifySms: next }),
      });
      const data = await res.json().catch(() => ({}));
      onChanged();
      if (next && data.smsSent === false) {
        setMsg('Consent SMS could not be sent — check server logs. Toggle off and back on to retry.');
      } else if (next && data.smsSent) {
        setMsg('Consent SMS sent.');
      }
    } catch {
      setMsg('Could not save SMS setting — check your connection.');
    }
  }

  async function invite() {
    if (!invName || !invEmail) return;
    setMsg('');
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, name: invName, clientName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setInvName(''); setInvEmail(''); setInviteOpen(false);
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  return (
    <Card
      title="Client portal"
      action={
        <button type="button" onClick={() => setInviteOpen(o => !o)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12.5, fontWeight: 600, color: T.brand }}>
          {inviteOpen ? 'Cancel' : '+ Invite user'}
        </button>
      }
    >
      {users.length === 0 && !inviteOpen && (
        <p style={{ fontSize: 13, color: T.ink3, margin: '0 0 4px' }}>No portal users yet — nobody is seeing this.</p>
      )}

      {users.map(u => (
        <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: T.ink2, padding: '4px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {u.name} · {u.email}
              {!u.emailVerified && <> <StatusBadge tone="amber" dot={false}>Pending</StatusBadge></>}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: u.phone ? T.ink3 : T.ghost, fontStyle: u.phone ? 'normal' : 'italic' }}>
                {u.phone ?? 'No phone in ClickUp'}
              </span>
              <Toggle checked={u.notifySms} label="SMS" onChange={next => saveUserSms(u.id, next)} disabled={!u.phone} />
              {u.smsConsentStatus === 'pending'   && <StatusBadge tone="amber" dot={false}>Consent pending</StatusBadge>}
              {u.smsConsentStatus === 'opted_in'  && <StatusBadge tone="green"  dot={false}>Opted in</StatusBadge>}
              {u.smsConsentStatus === 'opted_out' && <StatusBadge tone="red"    dot={false}>Opted out</StatusBadge>}
            </div>
          </div>
        </div>
      ))}

      {inviteOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '10px 0' }}>
          <input aria-label="Name" value={invName} onChange={e => setInvName(e.target.value)} placeholder="Name" style={{ padding: '8px 11px', borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontFamily: 'inherit', fontSize: 13 }} />
          <input aria-label="Email" type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="Email" style={{ padding: '8px 11px', borderRadius: 8, border: `1px solid ${T.lineStrong}`, fontFamily: 'inherit', fontSize: 13 }} />
          <Button size="sm" onClick={invite} disabled={!invName || !invEmail}>Send invite</Button>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        {TOGGLE_LABELS.map(t => (
          <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 0', borderTop: `1px solid ${T.dividerLight}` }}>
            <span style={{ fontSize: 13, color: T.ink2 }}>{t.label}</span>
            <Toggle checked={toggles[t.key]} label={t.label} onChange={next => setToggle(t.key, next)} />
          </div>
        ))}
      </div>

      {msg && <div style={{ fontSize: 12, color: T.danger, marginTop: 8 }}>{msg}</div>}
    </Card>
  );
}
