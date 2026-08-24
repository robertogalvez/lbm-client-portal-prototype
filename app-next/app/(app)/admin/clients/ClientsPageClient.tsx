'use client';

import { useState, useEffect } from 'react';
import { ClientEditPanel, type ContractPeriodRecord, type SocialLinks } from '@/components/shared/ClientEditPanel';
import { ClientDetail } from '@/components/dashboard/ClientDetail';
import { PortfolioTable, type PortfolioClientRow } from '@/components/dashboard/PortfolioTable';
import type { KpiData } from '@/components/dashboard/MetricStrip';
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

// Portfolio is the single landing view for /admin/clients — a 10,000-foot
// read of every client's health/delivery status, folding in what used to be
// a separate "Directory" tab (portal-user counts, billing type) and an
// "Asset inventory" tab (dropped entirely — each client's own detail page
// already shows its channels under "Channels & assets").
export function ClientsPageClient({
  clients: initial, portfolioKpis, portfolioRows,
}: {
  clients: ClientRecord[];
  portfolioKpis: KpiData[];
  portfolioRows: PortfolioClientRow[];
}) {
  const [clients, setClients] = useState<ClientRecord[]>(initial);
  const [showInactive, setShowInactive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // A row backed by a real contract period opens the unified <ClientDetail>.
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  // A row with no contract yet (row.noContractClientId set) has no period id
  // to open ClientDetail with — falls back to a minimal panel that's just
  // the contract editor, so the admin can add the first one from here.
  const [noPeriodClient, setNoPeriodClient] = useState<ClientRecord | null>(null);

  useEffect(() => {
    if (!noPeriodClient) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setNoPeriodClient(null);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [noPeriodClient]);

  function handleSelect(row: PortfolioClientRow) {
    if (row.noContractClientId) {
      const match = clients.find(c => c.id === row.noContractClientId);
      if (match) setNoPeriodClient(match);
      return;
    }
    setSelectedClient({ id: row.id, name: row.name });
  }

  function openByName(name: string) {
    const row = portfolioRows.find(r => r.name === name);
    if (row) handleSelect(row);
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

  const inactiveNames = new Set(clients.filter(c => c.clientStatus === 'Inactive').map(c => c.name));
  const inactiveCount = inactiveNames.size;
  const visibleRows = portfolioRows.filter(r => showInactive || !inactiveNames.has(r.name));

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
            <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 2 }}>{visibleRows.length} client{visibleRows.length !== 1 ? 's' : ''} · synced from ClickUp&apos;s Master Clients List</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#54616f', cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ cursor: 'pointer' }} />
              Show inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </label>
            {syncMsg && <span style={{ fontSize: 13, color: syncMsg.includes('rror') || syncMsg.includes('ail') ? '#cf3f36' : '#54616f' }}>{syncMsg}</span>}
            <button type="button" onClick={syncNow} disabled={syncing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 14, cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 2v6h-6M3 22v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15" /></svg>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        <RenewalsPanel onOpenClient={openByName} />

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: '14px 28px 40px' }}>
          <PortfolioTable kpis={portfolioKpis} rows={visibleRows} onSelect={handleSelect} />
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
