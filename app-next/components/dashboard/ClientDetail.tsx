'use client';

import { useEffect, useState } from 'react';
import type { HealthTier } from '@/lib/contracts';

export interface LedgerRow {
  id: string;
  title: string;
  status: string;
  dateUpdated: string;
  frameLink: string | null;
  instagramUrl: string | null;
}

export interface ContractHistoryRow {
  id: string;
  label: string;
  state: string;
  startsOn: string;
  endsOn: string | null;
  contractedTotal: number;
  delivered: number;
  fulfilmentPct: number | null;
  cadenceText: string | null;
}

export interface ClientDetailData {
  name: string;
  type: 'retainer' | 'package';
  health: HealthTier;
  contracted: number;
  published: number;
  pendingReview: number;
  editing: number;
  onHold: number;
  beyond: number;
  fulfilmentPct: number | null;
  currentPeriod: {
    label: string;
    model: string;
    cadencePerWeek: number | null;
    monthlyQuota: number | null;
    contractedTotal: number;
    carriedIn: number;
    notes: string | null;
    startsOn: string;
    endsOn: string | null;
    state: string;
  };
  deliverableMix: { type: 'short_form' | 'youtube' | 'ad'; delivered: number }[];
  ledger: LedgerRow[];
  contractHistory: ContractHistoryRow[];
}

const HEALTH_LABEL: Record<HealthTier, string> = {
  critical: 'Needs attention', watch: 'At risk', 'on-track': 'On track',
  completed: 'Completed', pending: 'Pending', internal: 'Internal',
};

const DELIVERABLE_LABEL: Record<string, string> = { short_form: 'Short-form', youtube: 'YouTube', ad: 'Ads' };

const LEDGER_STATUS_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'hold',    label: 'On hold',              statuses: [] }, // no live "on hold" status today — always empty
  { key: 'review',  label: 'Pending your review',   statuses: ['for client review'] },
  { key: 'editing', label: 'In editing',            statuses: ['in progress (editor)', 'in progress (corrections)', 'tc - qc (somu)', 'qc final - am'] },
  { key: 'posted',  label: 'Published to socials',  statuses: ['posted in socials'] },
  { key: 'other',   label: 'Other',                 statuses: [] }, // catch-all, computed below
];

function normStatus(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function StatChip({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#8b97a4' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, fontFamily: 'var(--font-mono)', color: color ?? '#111c28', marginTop: 3 }}>{value}</div>
    </div>
  );
}

// Keyed by `id` from the caller (see DashboardTabs.tsx) so switching clients
// remounts this component instead of needing an effect to reset stale state.
export function ClientDetail({ id, name, onBack }: { id: string; name: string; onBack: () => void }) {
  const [data, setData] = useState<ClientDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/dashboard/client-detail?id=${encodeURIComponent(id)}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
      .then(setData)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'));
  }, [id]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button type="button" onClick={onBack} style={{ width: 36, height: 36, borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', fontFamily: 'inherit', fontSize: 16 }}>←</button>
        <div style={{ fontSize: 12.5, color: '#8b97a4' }}>Clients / <span style={{ color: '#111c28', fontWeight: 600 }}>{name}</span></div>
      </div>

      {error && <div style={{ color: '#cf3f36', fontSize: 13.5 }}>Couldn&apos;t load this client: {error}</div>}
      {!data && !error && <div style={{ color: '#8b97a4', fontSize: 13.5 }}>Loading…</div>}
      {data && <ClientDetailBody data={data} />}
    </div>
  );
}

function ClientDetailBody({ data }: { data: ClientDetailData }) {
  const [ledgerFilter, setLedgerFilter] = useState<string>('all');

  const groupedLedger = LEDGER_STATUS_GROUPS.map(g => ({
    ...g,
    rows: g.key === 'other'
      ? data.ledger.filter(r => !LEDGER_STATUS_GROUPS.some(og => og.key !== 'other' && og.statuses.includes(normStatus(r.status))))
      : data.ledger.filter(r => g.statuses.includes(normStatus(r.status))),
  })).filter(g => g.rows.length > 0);

  const visibleGroups = ledgerFilter === 'all' ? groupedLedger : groupedLedger.filter(g => g.key === ledgerFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1180 }}>
      {/* Header band */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#FF6000', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {data.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800 }}>{data.name}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 7, color: data.type === 'retainer' ? '#2563eb' : '#7c66c4', background: data.type === 'retainer' ? '#eaf0ff' : '#efeafa' }}>
              {data.type === 'retainer' ? 'Retainer' : 'Package'}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: '#8b97a4', marginTop: 2 }}>{data.currentPeriod.label}</div>
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, padding: '4px 11px', borderRadius: 8, color: '#54616f', background: '#eef1f4' }}>{HEALTH_LABEL[data.health]}</span>
      </div>

      {/* 6-col stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', padding: '16px 18px' }}>
        <StatChip label="Contracted" value={data.contracted} />
        <StatChip label="Published" value={data.published} color="#14805f" />
        <StatChip label="Pending review" value={data.pendingReview} color={data.pendingReview > 0 ? '#a86a00' : undefined} />
        <StatChip label="In editing" value={data.editing} color={data.editing > 0 ? '#2563eb' : undefined} />
        <StatChip label="On hold" value={data.onHold} color={data.onHold > 0 ? '#cf3f36' : undefined} />
        <StatChip label="Beyond contract" value={data.beyond} color={data.beyond > 0 ? '#FF6000' : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1fr)', gap: 18, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Delivery progress">
            <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', marginBottom: 6 }}>{data.published} / {data.contracted}{data.fulfilmentPct !== null ? ` · ${Math.round(data.fulfilmentPct)}%` : ''}</div>
            <div style={{ height: 10, borderRadius: 100, background: '#f0f2f5', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, (data.published / Math.max(1, data.contracted)) * 100)}%`, height: '100%', background: data.beyond >= 0 ? '#14805f' : '#a86a00', borderRadius: 100 }} />
            </div>
            <div style={{ fontSize: 12.5, color: '#54616f', marginTop: 6 }}>
              {data.beyond > 0
                ? `Over-delivered — ${data.beyond} videos beyond the contracted scope of ${data.contracted}`
                : `${Math.abs(data.beyond)} remaining to fulfill the contract`}
            </div>
          </Card>

          <Card title="Contract scope">
            <Row label="Delivery model" value={data.currentPeriod.model === 'package' ? 'Package' : 'Monthly delivery'} />
            {data.currentPeriod.cadencePerWeek != null && <Row label="Publishing cadence" value={`${data.currentPeriod.cadencePerWeek}×/week`} />}
            <Row label="Contract period" value={`${new Date(data.currentPeriod.startsOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – ${data.currentPeriod.endsOn ? new Date(data.currentPeriod.endsOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Open'}`} />
            <Row label="Contracted scope" value={`${data.currentPeriod.contractedTotal} deliverables`} />
            {data.currentPeriod.carriedIn > 0 && <Row label="Carried in" value={`${data.currentPeriod.carriedIn} from prior contract`} />}
            {data.currentPeriod.notes && <Row label="Notes" value={data.currentPeriod.notes} />}
          </Card>

          <Card title="Deliverable mix">
            {data.deliverableMix.length === 0 ? (
              <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#8b97a4' }}>Awaiting production data</div>
            ) : data.deliverableMix.map(m => (
              <div key={m.type} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span>{DELIVERABLE_LABEL[m.type] ?? m.type}</span>
                  <span style={{ fontFamily: 'var(--font-mono)' }}>{m.delivered} delivered</span>
                </div>
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#8b97a4', marginTop: 4 }}>Per-type contracted splits aren&apos;t modeled yet — only delivered counts are shown.</div>
          </Card>

          <Card title="Video ledger">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {['all', ...groupedLedger.map(g => g.key)].map(key => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLedgerFilter(key)}
                  style={{
                    fontSize: 11.5, fontWeight: 600, padding: '5px 10px', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit',
                    border: ledgerFilter === key ? '1px solid #FF6000' : '1px solid #d4dbe2',
                    background: ledgerFilter === key ? '#fff1e8' : '#fff',
                    color: ledgerFilter === key ? '#B23E00' : '#54616f',
                  }}
                >
                  {key === 'all' ? 'All' : groupedLedger.find(g => g.key === key)?.label}
                </button>
              ))}
            </div>
            <div style={{ maxHeight: 520, overflowY: 'auto' }}>
              {data.ledger.length === 0 && <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#8b97a4' }}>No per-video ledger available for this client yet.</div>}
              {visibleGroups.map(g => (
                <div key={g.key}>
                  <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#8b97a4', padding: '8px 2px', position: 'sticky', top: 0, background: '#fff' }}>{g.label} ({g.rows.length})</div>
                  {g.rows.map(r => (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 2px', borderBottom: '1px solid #f0f2f5' }}>
                      <span style={{ width: 88, fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#8b97a4', flexShrink: 0 }}>{new Date(r.dateUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span style={{ flex: 1, fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                      {r.frameLink && <a href={r.frameLink} target="_blank" rel="noopener noreferrer" title="Frame.io" style={{ fontSize: 11, color: '#5b6bff', fontWeight: 600, flexShrink: 0 }}>F.io</a>}
                      {r.instagramUrl && <a href={r.instagramUrl} target="_blank" rel="noopener noreferrer" title="Live" style={{ fontSize: 11, color: '#14805f', fontWeight: 600, flexShrink: 0 }}>Live</a>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card title="Contract history">
            {data.contractHistory.map(h => (
              <div key={h.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid #f0f2f5' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{h.label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#eef1f4', color: '#54616f' }}>{h.state}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: '#8b97a4', marginTop: 2 }}>
                  {new Date(h.startsOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – {h.endsOn ? new Date(h.endsOn).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Open'}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12 }}>
                  <span>Delivered <b style={{ fontFamily: 'var(--font-mono)' }}>{h.delivered}</b></span>
                  <span>Fulfilment <b style={{ fontFamily: 'var(--font-mono)' }}>{h.fulfilmentPct !== null ? `${Math.round(h.fulfilmentPct)}%` : '—'}</b></span>
                  {h.cadenceText && <span>{h.cadenceText}</span>}
                </div>
              </div>
            ))}
          </Card>

          <div style={{ background: '#fff1e8', border: '1px solid #ffdfcb', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#B23E00', marginBottom: 6 }}>Next action</div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: '#334155' }}>
              {data.pendingReview > 0 && `${data.pendingReview} video${data.pendingReview === 1 ? '' : 's'} awaiting client review. `}
              {data.editing > 0 && `${data.editing} in active editing. `}
              {data.beyond < 0 && `${Math.abs(data.beyond)} still to deliver against the current contract.`}
              {data.pendingReview === 0 && data.editing === 0 && data.beyond >= 0 && 'No open items — contract is on pace.'}
            </div>
          </div>

          <Card title="Footage supply">
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#8b97a4' }}>Not tracked — no system of record for raw footage supply exists yet.</div>
          </Card>

          <Card title="Channels & assets">
            <div style={{ fontSize: 12.5, fontStyle: 'italic', color: '#8b97a4' }}>Not tracked — per-platform handles aren&apos;t modeled in the schema yet.</div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', padding: '14px 16px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '6px 0', borderBottom: '1px solid #f0f2f5', fontSize: 12.5 }}>
      <span style={{ color: '#8b97a4' }}>{label}</span>
      <span style={{ fontWeight: 600, textAlign: 'right' }}>{value}</span>
    </div>
  );
}
