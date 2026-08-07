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

export function DashboardTabs({ pipelineStageTotals, pipelineStalledTotals, pipelinePeriods, pipelineClientRows, portfolioKpis, portfolioRows, assetRows }: Props) {
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [clientsView, setClientsView] = useState<'portfolio' | 'assets'>('portfolio');

  return (
    <div style={{ padding: '20px 24px 40px', display: 'flex', flexDirection: 'column', gap: 34 }}>
      <PipelineAnalytics
        stageTotals={pipelineStageTotals}
        stalledTotals={pipelineStalledTotals}
        periods={pipelinePeriods}
        clientRows={pipelineClientRows}
      />

      {/* CLIENTS */}
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.005em', marginBottom: 2 }}>Clients</div>
        <div style={{ fontSize: 12, color: '#8b97a4', marginBottom: 14 }}>Portfolio overview &amp; asset inventory</div>

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
