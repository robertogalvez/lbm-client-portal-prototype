'use client';

import { useState } from 'react';
import { PipelineAnalytics, type PipelineStageCounts, type PipelinePeriod, type PipelinePeriodStat, type PipelineClientRow } from './PipelineAnalytics';
import { type KpiData } from './MetricStrip';
import { PortfolioTable, type PortfolioClientRow } from './PortfolioTable';
import { ClientDetail } from './ClientDetail';
import { AssetInventory, type AssetInventoryRow } from './AssetInventory';
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
}

const TABS = ['overview', 'clients'] as const;
type Tab = typeof TABS[number];

export function DashboardTabs({ pipelineStageTotals, pipelineStalledTotals, pipelinePeriods, pipelineClientRows, portfolioKpis, portfolioRows, assetRows }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [clientsView, setClientsView] = useState<'portfolio' | 'assets'>('portfolio');

  const tabStyle = (t: Tab): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '13px 15px 12px', fontSize: 13.5, fontWeight: 600,
    color: activeTab === t ? '#B23E00' : '#8b97a4',
    marginBottom: -1, cursor: 'pointer', background: 'none', border: 'none',
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
      <div className="db-tab-strip">
        <button type="button" style={tabStyle('overview')} onClick={() => setActiveTab('overview')}>
          Production Overview
        </button>
        <button type="button" style={tabStyle('clients')} onClick={() => setActiveTab('clients')}>
          Clients <span style={ct(portfolioRows.length)}>{portfolioRows.length}</span>
        </button>
      </div>

      {/* PRODUCTION OVERVIEW */}
      <div style={{ display: activeTab === 'overview' ? 'block' : 'none', padding: '20px 24px 40px' }}>
        <PipelineAnalytics
          stageTotals={pipelineStageTotals}
          stalledTotals={pipelineStalledTotals}
          periods={pipelinePeriods}
          clientRows={pipelineClientRows}
        />
      </div>

      {/* CLIENTS */}
      <div style={{ display: activeTab === 'clients' ? 'block' : 'none', padding: '20px 24px 40px' }}>
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
