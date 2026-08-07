'use client';

import { Suspense, useState } from 'react';
import { PipelineAnalytics, type PipelineStageCounts, type PipelinePeriod, type PipelinePeriodStat, type PipelineClientRow } from './PipelineAnalytics';
import { type KpiData } from './MetricStrip';
import { PortfolioTable, type PortfolioClientRow } from './PortfolioTable';
import { ClientDetail } from './ClientDetail';
import { AssetInventory, type AssetInventoryRow } from './AssetInventory';
import { InactiveToggle } from './InactiveToggle';
export type { KpiData } from './MetricStrip';
export type { PortfolioClientRow } from './PortfolioTable';
export type { AssetInventoryRow } from './AssetInventory';
export type { PipelineStage, PipelineStageCounts, PipelinePeriod, PipelinePeriodStat, PipelineClientRow } from './PipelineAnalytics';

interface Props {
  pipelineStageTotals: PipelineStageCounts;
  pipelineStalledTotals: PipelineStageCounts;
  pipelinePeriods: Record<PipelinePeriod, PipelinePeriodStat>;
  pipelineClientRows: PipelineClientRow[];
  portfolioKpis: KpiData[];
  portfolioRows: PortfolioClientRow[];
  assetRows: AssetInventoryRow[];
  error?: string | null;
}

const TABS = ['overview', 'clients'] as const;
type Tab = typeof TABS[number];

export function DashboardTabs({ pipelineStageTotals, pipelineStalledTotals, pipelinePeriods, pipelineClientRows, portfolioKpis, portfolioRows, assetRows, error }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [clientsView, setClientsView] = useState<'portfolio' | 'assets'>('portfolio');

  const tabStyle = (t: Tab): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, height: '100%',
    padding: '0 4px', fontSize: 13.5, fontWeight: 600,
    color: activeTab === t ? '#B23E00' : '#8b97a4',
    cursor: 'pointer', background: 'none', border: 'none',
    borderBottomStyle: 'solid', borderBottomWidth: 2,
    borderBottomColor: activeTab === t ? '#FF6000' : 'transparent',
    fontFamily: 'inherit', transition: 'color 130ms',
  });

  const ct = (count: number): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    padding: '1px 7px', borderRadius: 100, background: '#f5f7f9', color: '#54616f',
  });

  return (
    <div>
      {/* Topbar — title, tabs, and the global toggle share one row on wide
          screens; .db-dash-tabs wraps onto its own scrollable row below
          860px (see globals.css) so the tab labels never get crushed. */}
      <div className="db-topbar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 28, padding: '0 24px', borderBottom: '1px solid #e7ebef', minHeight: 56 }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Dashboard</span>
        </div>

        <div className="db-dash-tabs" style={{ display: 'flex', gap: 24, overflowX: 'auto' }}>
          <button type="button" style={tabStyle('overview')} onClick={() => setActiveTab('overview')}>
            Production Overview
          </button>
          <button type="button" style={tabStyle('clients')} onClick={() => setActiveTab('clients')}>
            Clients <span style={ct(portfolioRows.length)}>{portfolioRows.length}</span>
          </button>
        </div>

        <div className="db-topbar-right db-dash-toggle" style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
          <Suspense fallback={null}>
            <InactiveToggle />
          </Suspense>
        </div>
      </div>

      {/* Persistent glance zone */}
      {error && (
        <div style={{ margin: '18px 24px 0' }}>
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 16px', fontSize: 13, color: '#cf3f36' }}>
            ClickUp error: {error}
          </div>
        </div>
      )}

      {/* PRODUCTION OVERVIEW */}
      <div style={{ display: activeTab === 'overview' ? 'block' : 'none', padding: '14px 24px 40px' }}>
        <PipelineAnalytics
          stageTotals={pipelineStageTotals}
          stalledTotals={pipelineStalledTotals}
          periods={pipelinePeriods}
          clientRows={pipelineClientRows}
        />
      </div>

      {/* CLIENTS */}
      <div style={{ display: activeTab === 'clients' ? 'block' : 'none', padding: '14px 24px 40px' }}>
        {selectedClient ? (
          <ClientDetail key={selectedClient.id} id={selectedClient.id} name={selectedClient.name} onBack={() => setSelectedClient(null)} />
        ) : (
          <>
            <div style={{ display: 'inline-flex', background: '#f5f7f9', border: '1px solid #e7ebef', borderRadius: 9, padding: 3, gap: 2, marginBottom: 14 }}>
              {(['portfolio', 'assets'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setClientsView(v)}
                  style={{
                    fontSize: 12.5, fontWeight: 600, borderRadius: 7, padding: '6px 12px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    background: clientsView === v ? '#fff' : 'transparent',
                    color: clientsView === v ? '#111c28' : '#54616f',
                    boxShadow: clientsView === v ? '0 1px 2px rgba(17,28,40,.08)' : 'none',
                  }}
                >
                  {v === 'portfolio' ? 'Portfolio overview' : 'Asset inventory'}
                </button>
              ))}
            </div>
            {clientsView === 'portfolio' ? (
              <PortfolioTable kpis={portfolioKpis} rows={portfolioRows} onSelect={row => setSelectedClient({ id: row.id, name: row.name })} />
            ) : (
              <AssetInventory rows={assetRows} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
