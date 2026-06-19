'use client';

import { useState } from 'react';

export interface ApprovalRow {
  id: string;
  title: string;
  clientName: string | null;
  amName: string | null;
  daysWaiting: number;
  frameLink: string | null;
}

export interface ClientRow {
  name: string;
  total: number;
  inReview: number;
  oldestDays: number;
}

export interface EditorRow {
  name: string;
  active: number;
  approved: number;
  rework: number;
  firstPassClean: number | null;
}

export interface PipelineStage {
  key: string;
  label: string;
  group: string;
  count: number;
  barColor: string;
  isRework: boolean;
}

export interface AttentionClient {
  name: string;
  daysWaiting: number;
}

export interface TopEditor {
  name: string;
  firstPassClean: number;
}

interface Props {
  approvals: ApprovalRow[];
  clients: ClientRow[];
  editors: EditorRow[];
  pipeline: PipelineStage[];
  attentionClients: AttentionClient[];
  topEditors: TopEditor[];
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
  const stale = days > 3;
  return (
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: stale ? '#cf3f36' : '#8b97a4' }}>
      {days === 0 ? 'Today' : `${days}d`}
    </span>
  );
}

function StatusChip({ inReview, oldestDays }: { inReview: number; oldestDays: number }) {
  if (inReview === 0) return <span style={{ fontSize: 11, fontWeight: 600, color: '#14805f', background: '#e6f4ee', padding: '3px 9px', borderRadius: 7 }}>On track</span>;
  if (oldestDays > 3) return <span style={{ fontSize: 11, fontWeight: 600, color: '#a86a00', background: '#fbf1dc', padding: '3px 9px', borderRadius: 7 }}>Needs attention</span>;
  return <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb', background: '#eaf0ff', padding: '3px 9px', borderRadius: 7 }}>In review</span>;
}

function CleanBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? '#14805f' : pct >= 50 ? '#FF6000' : '#a86a00';
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

const PIPELINE_GROUPS = ['To do', 'In progress', 'Quality check', 'Review & ship'];

export function DashboardTabs({ approvals, clients, editors, pipeline, attentionClients, topEditors, defaultTab }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'clients' | 'editors'>(
    (defaultTab as 'approvals') ?? 'overview'
  );
  const [approvalSearch, setApprovalSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [editorSearch, setEditorSearch] = useState('');

  const maxPipeline = Math.max(...pipeline.map(s => s.count), 1);

  const filteredApprovals = approvals.filter(r =>
    !approvalSearch || r.title.toLowerCase().includes(approvalSearch.toLowerCase()) || (r.clientName ?? '').toLowerCase().includes(approvalSearch.toLowerCase())
  );
  const filteredClients = clients.filter(r => !clientSearch || r.name.toLowerCase().includes(clientSearch.toLowerCase()));
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
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '0 24px', borderBottom: '1px solid #e7ebef', marginTop: 16 }}>
        {(['overview', 'approvals', 'clients', 'editors'] as const).map(t => (
          <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
            {t === 'overview' && 'Overview'}
            {t === 'approvals' && (<>Approvals <span style={ct(approvals.length, approvals.length > 0 ? 'amber' : undefined)}>{approvals.length}</span></>)}
            {t === 'clients' && (<>Clients <span style={ct(clients.length)}>{clients.length}</span></>)}
            {t === 'editors' && (<>Editors <span style={ct(editors.length)}>{editors.length}</span></>)}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      <div style={{ display: activeTab === 'overview' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        {/* Pipeline card */}
        <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>Production pipeline</h3>
              <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Click a stage to filter approvals</div>
            </div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: '#8b97a4', background: '#f5f7f9', border: '1px solid #e7ebef', padding: '3px 8px', borderRadius: 7, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: 2, background: '#7B68EE', display: 'inline-block' }} />
              ClickUp status
            </span>
          </div>
          <div style={{ padding: '14px 18px 16px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {PIPELINE_GROUPS.map(group => {
              const groupStages = pipeline.filter(s => s.group === group);
              if (!groupStages.length) return null;
              return (
                <div key={group}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8b97a4', margin: '11px 0 5px' }}>{group}</div>
                  {groupStages.map(stage => {
                    const barPct = Math.round(stage.count / maxPipeline * 100);
                    return (
                      <button
                        key={stage.key}
                        onClick={() => setActiveTab('approvals')}
                        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', width: '100%', cursor: 'pointer', textAlign: 'left', transition: 'background 130ms', fontFamily: 'inherit' }}
                        onMouseEnter={e => (e.currentTarget.style.background = '#f5f7f9')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span className="db-stage-label">
                          {stage.label}
                          {stage.isRework && <span style={{ fontSize: 9.5, fontWeight: 700, color: '#a86a00', background: '#fbf1dc', padding: '1px 6px', borderRadius: 5 }}>rework</span>}
                        </span>
                        <div style={{ flex: 1, height: 8, background: '#f0f2f5', borderRadius: 100, overflow: 'hidden' }}>
                          <div style={{ width: `${barPct}%`, height: '100%', borderRadius: 100, background: stage.barColor }} />
                        </div>
                        <span style={{ width: 30, textAlign: 'right', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', fontSize: 13, fontWeight: 700 }}>{stage.count}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* 2-col: Needs attention + Top editors */}
        <div className="db-ov2">
          {/* Needs attention */}
          <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Needs attention</h3>
              <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Clients with review waiting &gt; 3 days</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {attentionClients.length === 0 ? (
                  <tr><td style={{ padding: '16px 18px', color: '#8b97a4', fontSize: 13 }}>No overdue reviews 🎉</td></tr>
                ) : attentionClients.map(c => (
                  <tr key={c.name} style={{ cursor: 'pointer' }} onClick={() => setActiveTab('clients')}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...tdNum }}><WaitBadge days={c.daysWaiting} /></td>
                    <td style={{ ...tdNum }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#cf3f36', background: '#fdedeb', padding: '3px 9px', borderRadius: 7 }}>Needs attention</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top editors */}
          <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Top editors</h3>
                <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>By first-pass clean</div>
              </div>
              <button onClick={() => setActiveTab('editors')} style={{ fontSize: 12.5, fontWeight: 700, color: '#B23E00', background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                View all {editors.length}
              </button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <tbody>
                {topEditors.map(e => (
                  <tr key={e.name} style={{ cursor: 'pointer' }} onClick={() => setActiveTab('editors')}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(e.name), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{initials(e.name)}</span>
                        {e.name}
                      </div>
                    </td>
                    <td style={tdNum}><CleanBar pct={e.firstPassClean} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* APPROVALS */}
      <div style={{ display: activeTab === 'approvals' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
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
                  <th style={thNum}>Waiting</th>
                  <th style={{ ...thNum, textAlign: 'right', paddingRight: 18 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredApprovals.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #e7ebef' }}>
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
      <div style={{ display: activeTab === 'clients' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Client breakdown</h3>
              <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>{clients.length} clients · pending review &amp; oldest wait</div>
            </div>
            <SearchInput value={clientSearch} onChange={setClientSearch} placeholder="Search clients…" />
          </div>
          <div className="db-tscroll" style={{ maxHeight: 400 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Client</th>
                  <th style={thNum}>Total</th>
                  <th style={thNum}>In review</th>
                  <th style={thNum}>Oldest wait</th>
                  <th style={thNum}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(c => (
                  <tr key={c.name} style={{ borderBottom: '1px solid #e7ebef' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                    <td style={tdNum}>{c.total}</td>
                    <td style={tdNum}>{c.inReview > 0 ? <span style={{ fontWeight: 600, color: c.oldestDays > 3 ? '#a86a00' : '#2563eb' }}>{c.inReview}</span> : <span style={{ color: '#8b97a4' }}>—</span>}</td>
                    <td style={tdNum}>{c.inReview > 0 ? <WaitBadge days={c.oldestDays} /> : <span style={{ color: '#8b97a4' }}>—</span>}</td>
                    <td style={tdNum}><StatusChip inReview={c.inReview} oldestDays={c.oldestDays} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* EDITORS */}
      <div style={{ display: activeTab === 'editors' ? 'block' : 'none', padding: '20px 24px 26px' }}>
        <div style={{ border: '1px solid #e7ebef', borderRadius: 12, background: '#fff', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
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
                  <th style={thNum}>Active</th>
                  <th style={thNum}>Approved</th>
                  <th style={thNum}>Rework</th>
                  <th style={thNum}>First-pass clean</th>
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
                    <td style={tdNum}>{e.active}</td>
                    <td style={tdNum}><span style={{ fontWeight: 600, color: '#14805f' }}>{e.approved}</span></td>
                    <td style={tdNum}>{e.rework > 0 ? <span style={{ fontWeight: 600, color: '#cf3f36' }}>{e.rework}</span> : <span style={{ color: '#8b97a4' }}>0</span>}</td>
                    <td style={tdNum}>{e.firstPassClean !== null ? <CleanBar pct={e.firstPassClean} /> : <span style={{ color: '#8b97a4' }}>—</span>}</td>
                  </tr>
                ))}
                {filteredEditors.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '24px 18px', color: '#8b97a4', textAlign: 'center' }}>No editors found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
