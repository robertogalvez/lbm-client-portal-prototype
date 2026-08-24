'use client';

import { useState, useEffect } from 'react';
import { ClientEditPanel, type ContractPeriodRecord, type SocialLinks } from '@/components/shared/ClientEditPanel';
import { ClientDetail } from '@/components/dashboard/ClientDetail';
import { PortfolioTable, type PortfolioClientRow } from '@/components/dashboard/PortfolioTable';
import { AssetInventory } from '@/components/dashboard/AssetInventory';
import type { KpiData } from '@/components/dashboard/MetricStrip';
import { resolveCurrentPeriod } from '@/lib/contracts';
import { RenewalsPanel } from './RenewalsPanel';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  clientName: string | null;
  emailVerified: boolean;
}

interface ClientRecord {
  id: string;
  name: string;
  type: string | null;
  monthlyQuota: number | null;
  clickupTaskId: string;
  frameioProjectId: string | null;
  whatsappNumber: string | null;
  brandingConfig: Record<string, unknown> | null;
  socialLinks: SocialLinks | null;
  showCalendar: boolean | null;
  showInvoices: boolean | null;
  showReport: boolean | null;
  notifyEmail: boolean | null;
  notifySms: boolean | null;
  notifyPush: boolean | null;
  contactName: string | null;
  contactEmail: string | null;
  clientStatus: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date | null;
  portalUsers: PortalUser[];
  periods: ContractPeriodRecord[];
}

const AVATAR_COLORS = ['#5e6b7a', '#5172c4', '#b58236', '#7c66c4', '#cf5b53', '#14805f', '#b06f06'];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const VIEW_MODES = ['directory', 'portfolio', 'assets'] as const;
type ViewMode = typeof VIEW_MODES[number];
const VIEW_MODE_LABEL: Record<ViewMode, string> = { directory: 'Directory', portfolio: 'Portfolio', assets: 'Asset inventory' };

export function ClientsPageClient({
  clients: initial, portfolioKpis, portfolioRows,
}: {
  clients: ClientRecord[];
  portfolioKpis: KpiData[];
  portfolioRows: PortfolioClientRow[];
}) {
  const [clients, setClients] = useState<ClientRecord[]>(initial);
  const [viewMode, setViewMode] = useState<ViewMode>('directory');
  const [showInactive, setShowInactive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // A selected period-scoped client opens the unified <ClientDetail> (the
  // former /dashboard "Clients" tab experience, now also carrying the
  // portal/admin section that used to live only in this page's own drawer).
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [viewingAs, setViewingAs] = useState<string | null>(null);
  // A client with zero contract periods has no period id to open
  // ClientDetail with (it's built around a period, not a bare client) — for
  // that one case only, fall back to a minimal panel that's just the
  // contract editor, so the admin can add a first contract from here.
  const [noPeriodClient, setNoPeriodClient] = useState<ClientRecord | null>(null);

  useEffect(() => {
    if (!noPeriodClient) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNoPeriodClient(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [noPeriodClient]);

  async function viewAsClient(c: ClientRecord, e: React.MouseEvent) {
    e.stopPropagation();
    setViewingAs(c.id);
    try {
      const res = await fetch('/api/admin/view-as', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: c.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start client view');
      window.location.assign('/client');
    } catch (err) {
      setViewingAs(null);
      alert(err instanceof Error ? err.message : 'Error');
    }
  }

  function openClientDetail(c: ClientRecord) {
    const period = resolveCurrentPeriod(c.periods, new Date()) ?? c.periods[c.periods.length - 1] ?? null;
    if (period) setSelectedClient({ id: period.id, name: c.name });
    else setNoPeriodClient(c);
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await fetch('/api/admin/clients/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setSyncMsg(`Synced ${data.synced} client${data.synced === 1 ? '' : 's'}${data.skipped ? `, skipped ${data.skipped} without a Client Status` : ''}.`);
      const listRes = await fetch('/api/admin/clients');
      if (listRes.ok) setClients(await listRes.json());
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSyncing(false);
    }
  }

  const visibleClients = clients.filter(c => showInactive || c.clientStatus !== 'Inactive');
  const inactiveCount = clients.length - clients.filter(c => c.clientStatus !== 'Inactive').length;
  const assetRows = clients.map(c => ({ id: c.id, name: c.name, socialLinks: c.socialLinks }));

  if (selectedClient) {
    return (
      <div style={{ padding: '14px 24px 40px', overflow: 'auto', height: '100vh', boxSizing: 'border-box', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
        <ClientDetail key={selectedClient.id} id={selectedClient.id} name={selectedClient.name} onBack={() => setSelectedClient(null)} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div className="db-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: '1px solid #e7ebef', background: '#fff', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111c28' }}>Clients</div>
            <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 2 }}>{visibleClients.length} client{visibleClients.length !== 1 ? 's' : ''} · synced from ClickUp&apos;s Master Clients List</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {viewMode === 'directory' && (
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#54616f', cursor: 'pointer' }}>
                <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ cursor: 'pointer' }} />
                Show inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
              </label>
            )}
            {syncMsg && <span style={{ fontSize: 13, color: syncMsg.includes('rror') || syncMsg.includes('ail') ? '#cf3f36' : '#54616f' }}>{syncMsg}</span>}
            <button type="button" onClick={syncNow} disabled={syncing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 14, cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 2v6h-6M3 22v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15" /></svg>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        <RenewalsPanel onOpenClient={name => {
          const match = clients.find(c => c.name === name);
          if (match) openClientDetail(match);
        }} />

        <div style={{ padding: '14px 28px 0' }}>
          <div style={{ display: 'inline-flex', background: '#f5f7f9', border: '1px solid #e7ebef', borderRadius: 9, padding: 3, gap: 2 }}>
            {VIEW_MODES.map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                style={{
                  fontSize: 12.5, fontWeight: 600, borderRadius: 7, padding: '6px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  background: viewMode === v ? '#fff' : 'transparent',
                  color: viewMode === v ? '#111c28' : '#54616f',
                  boxShadow: viewMode === v ? '0 1px 2px rgba(17,28,40,.08)' : 'none',
                }}
              >
                {VIEW_MODE_LABEL[v]}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 28px 40px' }}>
          {viewMode === 'portfolio' && (
            <PortfolioTable kpis={portfolioKpis} rows={portfolioRows} onSelect={row => setSelectedClient({ id: row.id, name: row.name })} />
          )}
          {viewMode === 'assets' && <AssetInventory rows={assetRows} />}
          {viewMode === 'directory' && (
          <div className="db-tscroll" style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e7ebef' }}>
                  {['Client', 'Type', 'Status', 'Portal users', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'inherit' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleClients.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '48px 16px', textAlign: 'center', color: '#8b97a4', fontSize: 14 }}>{clients.length === 0 ? <>No clients yet. Click &quot;Sync now&quot; to pull clients from ClickUp&apos;s Master Clients List.</> : 'No active clients. Check "Show inactive" to see them.'}</td></tr>
                )}
                {visibleClients.map((c, i) => (
                  <tr key={c.id} onClick={() => openClientDetail(c)} style={{ borderBottom: i < visibleClients.length - 1 ? '1px solid #f4f6f8' : 'none', cursor: 'pointer' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(c.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</span>
                        <span style={{ fontWeight: 600, color: '#111c28' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.type
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: c.type === 'retainer' ? '#1a56a0' : '#7c3aed', background: c.type === 'retainer' ? '#dbeafe' : '#ede9fe' }}>
                            {c.type === 'retainer' ? 'Retainer' : 'One-time'}
                          </span>
                        : <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: '#b06f06', background: '#fdf3e1' }}>Needs setup</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.clientStatus
                        ? <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: c.clientStatus === 'Active' ? '#14805f' : '#8b97a4', background: c.clientStatus === 'Active' ? '#e6f4ee' : '#f4f6f8' }}>{c.clientStatus}</span>
                        : <span style={{ fontSize: 13, color: '#8b97a4' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: -4 }}>
                        {c.portalUsers.slice(0, 3).map((u, j) => (
                          <span key={u.id} style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(u.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, border: '2px solid #fff', marginLeft: j > 0 ? -6 : 0 }}>{initials(u.name)}</span>
                        ))}
                        {c.portalUsers.length === 0 && <span style={{ fontSize: 13, color: '#8b97a4' }}>—</span>}
                        {c.portalUsers.length > 3 && <span style={{ fontSize: 11, color: '#8b97a4', marginLeft: 6 }}>+{c.portalUsers.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <button
                          type="button"
                          onClick={e => viewAsClient(c, e)}
                          disabled={viewingAs === c.id}
                          title="View the portal exactly as this client sees it"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#54616f', fontWeight: 600, background: 'none', border: 'none', cursor: viewingAs === c.id ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                          {viewingAs === c.id ? 'Opening…' : 'View portal'}
                        </button>
                        <span style={{ fontSize: 13, color: '#FF6000', fontWeight: 600 }}>View →</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>
      </div>

      {/* Minimal fallback for a client with zero contract periods yet — just
          the contract editor, so the admin can add the first one; the full
          <ClientDetail> becomes reachable on the next click once it exists. */}
      {noPeriodClient && (
        <>
          <div aria-hidden="true" onClick={() => setNoPeriodClient(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,28,40,.3)', zIndex: 40 }} />
          <div role="dialog" aria-modal="true" aria-labelledby="no-period-drawer-title" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', boxShadow: '-8px 0 32px rgba(17,28,40,.12)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e7ebef', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h3 id="no-period-drawer-title" style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>{noPeriodClient.name}</h3>
                <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 3 }}>No contract yet — add one to see full details</div>
              </div>
              <button type="button" aria-label="Close" onClick={() => setNoPeriodClient(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#54616f', padding: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
              <ClientEditPanel
                key={noPeriodClient.id}
                clientId={noPeriodClient.id}
                periods={noPeriodClient.periods}
                socialLinks={noPeriodClient.socialLinks}
                onPeriodsChange={next => {
                  setClients(prev => prev.map(c => c.id === noPeriodClient.id ? { ...c, periods: next } : c));
                  setNoPeriodClient(prev => prev ? { ...prev, periods: next } : prev);
                }}
                onSocialLinksSaved={next => {
                  setClients(prev => prev.map(c => c.id === noPeriodClient.id ? { ...c, socialLinks: next } : c));
                }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
