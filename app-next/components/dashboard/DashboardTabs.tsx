'use client';

import { Suspense, useState } from 'react';
import { InfoPopover } from '@/components/ui/Tooltip';
import { EDITOR_PHASE_COLS } from './editor-phases';
import { PipelineReport, type PipelineReportClient } from './PipelineReport';
import { MetricStrip, type KpiData } from './MetricStrip';
import { PortfolioTable, type PortfolioClientRow } from './PortfolioTable';
import { ClientDetail } from './ClientDetail';
import { AssetInventory, type AssetInventoryRow } from './AssetInventory';
import { FiltersBar } from './FiltersBar';
export type { PipelineReportClient } from './PipelineReport';
export type { KpiData } from './MetricStrip';
export type { PortfolioClientRow } from './PortfolioTable';
export type { AssetInventoryRow } from './AssetInventory';
export { EDITOR_PHASE_COLS } from './editor-phases';

export interface ApprovalRow {
  id: string;
  title: string;
  clientName: string | null;
  amName: string | null;
  daysWaiting: number;
  frameLink: string | null;
}

export interface EditorRow {
  name: string;
  active: number;
  approved: number;
  rework: number;
  firstPassClean: number | null;
  phases: Record<string, number>;
}


export interface BacklogRow {
  name: string;
  backlogCount: number;
}

interface Props {
  kpis: KpiData[];
  approvals: ApprovalRow[];
  portfolioKpis: KpiData[];
  portfolioRows: PortfolioClientRow[];
  assetRows: AssetInventoryRow[];
  editors: EditorRow[];
  allEditors: string[];
  allAMs: string[];
  allClients: string[];
  pipelineReport: PipelineReportClient[];
  reportAsOf: string;
  defaultTab?: string;
}

const AV_COLORS = ['#FF6000', '#5e6b7a', '#5172c4', '#7c66c4', '#b58236'];

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AV_COLORS[Math.abs(hash) % AV_COLORS.length];
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function WaitBadge({ days }: { days: number }) {
  const color = days > 14 ? '#cf3f36' : days > 3 ? '#a86a00' : '#8b97a4';
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color }}>
      {days === 0 ? 'Today' : `${days}d`}
    </span>
  );
}

function CleanBar({ pct }: { pct: number }) {
  const color = pct >= 97 ? '#14805f' : pct >= 90 ? '#a86a00' : '#cf3f36';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, justifyContent: 'center' }}>
      <div style={{ width: 60, height: 6, background: '#f0f2f5', borderRadius: 100, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 100, background: color }} />
      </div>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: 34, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#f5f7f9', border: '1px solid #e7ebef', padding: '7px 11px', borderRadius: 8, color: '#8b97a4', fontSize: 12.5, minWidth: 190 }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14,flexShrink:0}}>
        <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
      </svg>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12.5, color: '#111c28', width: '100%' }}
      />
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: '#8b97a4', padding: '10px 18px',
  background: '#f5f7f9', borderBottom: '1px solid #e7ebef', whiteSpace: 'nowrap',
};
const thNum: React.CSSProperties = { ...thStyle, textAlign: 'center' };
const td: React.CSSProperties = { padding: '11px 18px', borderBottom: '1px solid #e7ebef', verticalAlign: 'middle' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'center', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

export function DashboardTabs({ kpis, approvals, portfolioKpis, portfolioRows, assetRows, editors, allEditors, allAMs, allClients, pipelineReport, reportAsOf, defaultTab }: Props) {
  const [activeTab, setActiveTab] = useState<'clients' | 'approvals' | 'editors' | 'reports'>(
    (defaultTab as 'clients' | 'approvals' | 'editors' | 'reports') ?? 'clients'
  );
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [clientsView, setClientsView] = useState<'portfolio' | 'assets'>('portfolio');
  const [approvalSearch, setApprovalSearch] = useState('');
  const [editorSearch, setEditorSearch] = useState('');

  const filteredApprovals = approvals.filter(r =>
    !approvalSearch || r.title.toLowerCase().includes(approvalSearch.toLowerCase()) || (r.clientName ?? '').toLowerCase().includes(approvalSearch.toLowerCase())
  );
  const filteredEditors = editors.filter(r => !editorSearch || r.name.toLowerCase().includes(editorSearch.toLowerCase()));

  const tabStyle = (t: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '13px 15px 12px', fontSize: 13.5, fontWeight: 600,
    color: activeTab === t ? '#B23E00' : '#8b97a4',
    borderBottom: activeTab === t ? '2px solid #FF6000' : '2px solid transparent',
    marginBottom: -1, cursor: 'pointer', background: 'none', border: 'none',
    borderBottomStyle: 'solid',
    borderBottomWidth: 2,
    borderBottomColor: activeTab === t ? '#FF6000' : 'transparent',
    fontFamily: 'inherit',
    transition: 'color 130ms',
  });

  const ct = (count: number, tone?: 'amber'): React.CSSProperties => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
    padding: '1px 7px', borderRadius: 100,
    background: tone === 'amber' ? '#fbf1dc' : '#f5f7f9',
    color: tone === 'amber' ? '#a86a00' : '#54616f',
  });

  return (
    <div>
      {/* Pulse strip (§5.1) */}
      <div style={{ margin: '16px 24px 0' }}>
        <MetricStrip items={kpis} />
      </div>

      {/* Tab bar */}
      <div className="db-tab-strip">
        {(['clients', 'approvals', 'editors', 'reports'] as const).map(t => (
          <button type="button" key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
            {t === 'clients' && (<>Clients <span style={ct(portfolioRows.length)}>{portfolioRows.length}</span></>)}
            {t === 'approvals' && (<>Approvals <span style={ct(approvals.length, approvals.length > 0 ? 'amber' : undefined)}>{approvals.length}</span></>)}
            {t === 'editors' && (<>Editors <span style={ct(editors.length)}>{editors.length}</span></>)}
            {t === 'reports' && 'Reports'}
          </button>
        ))}
      </div>

      {/* APPROVALS */}
      <div style={{ display: activeTab === 'approvals' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>For client review</h3>
              <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Awaiting client approval · oldest first</div>
            </div>
            <SearchInput value={approvalSearch} onChange={setApprovalSearch} placeholder="Search videos…" />
          </div>
          <div className="db-tscroll" style={{ maxHeight: 360 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Video</th>
                  <th style={thStyle}>Client</th>
                  <th style={thStyle}>AM</th>
                  <th style={thNum}>Waiting <InfoPopover tip="Days since this video last changed status." /></th>
                  <th style={{ ...thNum, textAlign: 'right', paddingRight: 18 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredApprovals.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #e7ebef', background: r.daysWaiting > 14 ? 'rgba(207,63,54,0.04)' : 'transparent' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        <div style={{ width: 50, height: 32, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center', color: '#fff', background: 'linear-gradient(135deg,#2c3540,#4a5562)' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:13,height:13,opacity:.85}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{r.title}</div>
                          {r.frameLink && (
                            <a href={r.frameLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11.5, color: '#5b6bff', fontWeight: 600, textDecoration: 'none' }}>Frame.io ↗</a>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, color: '#54616f' }}>{r.clientName ?? '—'}</td>
                    <td style={{ ...td, color: '#54616f' }}>{r.amName ?? '—'}</td>
                    <td style={tdNum}><WaitBadge days={r.daysWaiting} /></td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
                        <a href={`/videos/${r.id}`} style={{ fontSize: 12, fontWeight: 700, borderRadius: 7, padding: '7px 11px', border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          Review
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredApprovals.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px 18px', color: '#8b97a4', textAlign: 'center' }}>No videos match your search</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {approvals.length > filteredApprovals.length && (
            <div style={{ padding: '14px 18px', borderTop: '1px solid #e7ebef', fontSize: 12.5, fontWeight: 600, color: '#B23E00' }}>
              Showing {filteredApprovals.length} of {approvals.length} pending
            </div>
          )}
        </div>
      </div>

      {/* CLIENTS */}
      <div style={{ display: activeTab === 'clients' ? 'block' : 'none', padding: '16px 26px 40px' }}>
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

      {/* EDITORS */}
      <div style={{ display: activeTab === 'editors' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        <div style={{ marginBottom: 14 }}>
          <Suspense fallback={null}>
            <FiltersBar members={allEditors} ams={allAMs} clients={allClients} />
          </Suspense>
        </div>
        <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef', flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Editor performance</h3>
              <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>{editors.length} editors · ranked by first-pass clean</div>
            </div>
            <SearchInput value={editorSearch} onChange={setEditorSearch} placeholder="Search editors…" />
          </div>
          <div className="db-tscroll" style={{ maxHeight: 420 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Editor</th>
                  {EDITOR_PHASE_COLS.map(p => (
                    <th key={p.key} style={thNum}>{p.label}</th>
                  ))}
                  <th style={thNum}>Rework <InfoPopover tip="Videos returned for corrections after client review." /></th>
                  <th style={thNum}>First-pass clean <InfoPopover tip="Approved ÷ (Approved + Rework). '—' when no completed videos yet." /></th>
                </tr>
              </thead>
              <tbody>
                {filteredEditors.map(e => (
                  <tr key={e.name} style={{ borderBottom: '1px solid #e7ebef' }}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(e.name), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{initials(e.name)}</span>
                        {e.name}
                      </div>
                    </td>
                    {EDITOR_PHASE_COLS.map(p => {
                      const count = e.phases[p.key] ?? 0;
                      const isPosted = p.key === 'posted in socials';
                      const isReview = p.key === 'for client review';
                      return (
                        <td key={p.key} style={tdNum}>
                          {count > 0
                            ? <span style={{ fontWeight: 600, color: isPosted ? '#14805f' : isReview ? '#a86a00' : '#111c28' }}>{count}</span>
                            : <span style={{ color: '#d4dbe2' }}>—</span>}
                        </td>
                      );
                    })}
                    <td style={tdNum}>{e.rework > 0 ? <span style={{ fontWeight: 600, color: '#cf3f36' }}>{e.rework}</span> : <span style={{ color: '#8b97a4' }}>0</span>}</td>
                    <td style={tdNum}>{e.firstPassClean !== null ? <CleanBar pct={e.firstPassClean} /> : <span style={{ color: '#8b97a4' }}>—</span>}</td>
                  </tr>
                ))}
                {filteredEditors.length === 0 && (
                  <tr><td colSpan={2 + EDITOR_PHASE_COLS.length} style={{ padding: '24px 18px', color: '#8b97a4', textAlign: 'center' }}>No editors found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Reports tab ── */}
      <div style={{ display: activeTab === 'reports' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        <PipelineReport clients={pipelineReport} asOf={reportAsOf} />
      </div>
    </div>
  );
}
