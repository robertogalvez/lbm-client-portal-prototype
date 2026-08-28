'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { T } from '@/components/ui/tokens';
import { ClientsTable } from '@/components/clients/ClientsTable';
import { ContractChannelsDrawer } from '@/components/shared/ContractChannelsDrawer';
import type { ContractPeriodRecord } from '@/lib/contract-records';
import type { SocialLinks } from '@/lib/socialLinks';
import type { AdminClientRow } from '@/lib/admin-views';
import { RenewalsPanel } from './RenewalsPanel';

export interface ClientRecord {
  id: string;
  name: string;
  socialLinks: SocialLinks | null;
  periods: ContractPeriodRecord[];
}

interface Props {
  rows: AdminClientRow[];
  inactiveCount: number;
  showInactive: boolean;
  clientRecords: ClientRecord[];
  /** ?client=<id> — a row with no contract period yet opens straight into the editor. */
  openClientId: string | null;
  /** A ClickUp fetch failure means the numbers below are stale — say so. */
  error?: string | null;
}

export function ClientsPageClient({ rows, inactiveCount, showInactive, clientRecords, openClientId, error }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Tab and the inactive filter both live in the URL, so a link to the
  // Coverage tab is shareable and survives a reload.
  const setParam = useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  }, [params, pathname, router]);

  const noPeriodClient = openClientId ? clientRecords.find(c => c.id === openClientId) ?? null : null;

  async function syncNow() {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await fetch('/api/admin/clients/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setSyncMsg(`Synced ${data.synced} client${data.synced === 1 ? '' : 's'}${data.skipped ? `, skipped ${data.skipped} without a Client Status` : ''}.`);
      router.refresh();
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main style={{ maxWidth: 1400 }}>
      <PageHeader
        title="Clients"
        subtitle={`${rows.length} ${showInactive ? '' : 'active '}account${rows.length === 1 ? '' : 's'} · sorted by risk, not alphabet`}
        actions={
          <>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: T.ink2, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showInactive}
                onChange={e => setParam('inactive', e.target.checked ? '1' : null)}
                style={{ cursor: 'pointer' }}
              />
              Show inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </label>
            {syncMsg && <span style={{ fontSize: 13, color: /rror|ail/.test(syncMsg) ? T.danger : T.ink2 }}>{syncMsg}</span>}
            <Button variant="outline" onClick={syncNow} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</Button>
          </>
        }
      />

      {error && (
        <div style={{ margin: '18px 34px 0' }}>
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: T.danger }}>
            ClickUp error: {error} — the counts below may be out of date.
          </div>
        </div>
      )}

      <div className="db-page-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <RenewalsPanel onOpenClient={name => {
          const row = rows.find(r => r.name === name);
          if (row?.periodId) router.push(`/admin/clients/${row.periodId}`);
          else if (row) setParam('client', row.clientId);
        }} />

        <ClientsTable rows={rows} inactiveCount={showInactive ? 0 : inactiveCount} />
      </div>

      {/* A client with no contract period has no detail page to open — the
          drawer is just the contract editor, so the first one can be added
          from here. */}
      {noPeriodClient && (
        <ContractChannelsDrawer
          key={noPeriodClient.id}
          open
          onClose={() => setParam('client', null)}
          clientId={noPeriodClient.id}
          clientName={noPeriodClient.name}
          periods={noPeriodClient.periods}
          socialLinks={noPeriodClient.socialLinks}
          onSaved={() => { setParam('client', null); router.refresh(); }}
        />
      )}

    </main>
  );
}
