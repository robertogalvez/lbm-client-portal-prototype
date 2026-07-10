'use client';

import { useState, Fragment } from 'react';
import { InfoPopover } from '@/components/ui/Tooltip';
import { EDITOR_PHASE_COLS } from './editor-phases';
import { AgreedVsDeliveredChart } from './AgreedVsDeliveredChart';
export { EDITOR_PHASE_COLS } from './editor-phases';

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
  reelsAgreed: number;
  reelsDelivered: number;
  ytAgreed: number;
  ytDelivered: number;
  backlogCount: number;
  stillNeeded: number;
  footageGap: number;
}

export interface EditorRow {
  name: string;
  active: number;
  approved: number;
  rework: number;
  firstPassClean: number | null;
  phases: Record<string, number>;
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

export interface StatusTask {
  id: string;
  title: string;
  clientName: string | null;
  amName: string | null;
  status: string;
  frameLink: string | null;
}

export interface AgreedDeliveredRow {
  name: string;
  agreed: number;
  delivered: number;
}

export interface BacklogRow {
  name: string;
  backlogCount: number;
}

interface Props {
  approvals: ApprovalRow[];
  clients: ClientRow[];
  editors: EditorRow[];
  pipeline: PipelineStage[];
  attentionClients: AttentionClient[];
  topEditors: TopEditor[];
  statusTasks: StatusTask[];
  agreedVsDelivered: AgreedDeliveredRow[];
  periodLabel: string;
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

type Tone = 'good' | 'warn' | 'bad' | 'none';
const TONE_COLORS: Record<Tone, { color: string; bg: string }> = {
  good: { color: '#14805f', bg: '#e6f4ee' },
  warn: { color: '#a86a00', bg: '#fbf1dc' },
  bad:  { color: '#cf3f36', bg: '#fdedeb' },
  none: { color: '#8b97a4', bg: '#f5f7f9' },
};

function deliveryTone(delivered: number, agreed: number): Tone {
  if (agreed <= 0) return 'none';
  const pct = delivered / agreed;
  if (pct >= 0.9) return 'good';
  if (pct >= 0.5) return 'warn';
  return 'bad';
}

function Chip({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  const t = TONE_COLORS[tone];
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 100, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: t.color, background: t.bg }}>
      {children}
    </span>
  );
}

function MiniBar({ pct, tone }: { pct: number; tone: Tone | 'empty' }) {
  const color = tone === 'empty' ? 'transparent' : TONE_COLORS[tone].color;
  return (
    <div style={{ height: 5, borderRadius: 100, background: '#eef1f4', overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', borderRadius: 100, background: color }} />
    </div>
  );
}

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 13, height: 13, color: '#8b97a4', flexShrink: 0, transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 150ms ease' }}
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function DeliveryCell({ row, expanded, onToggle }: { row: ClientRow; expanded: boolean; onToggle: () => void }) {
  const totalAgreed = row.reelsAgreed + row.ytAgreed;
  const totalDelivered = row.reelsDelivered + row.ytDelivered;
  const tone = deliveryTone(totalDelivered, totalAgreed);
  const pct = totalAgreed > 0 ? Math.round((totalDelivered / totalAgreed) * 100) : 0;
  const label = tone === 'none' ? 'No quota' : tone === 'good' ? `On pace · ${pct}%` : tone === 'warn' ? `Behind · ${pct}%` : `At risk · ${pct}%`;
  const reelsTone = row.reelsAgreed > 0 ? deliveryTone(row.reelsDelivered, row.reelsAgreed) : 'empty';
  const ytTone = row.ytAgreed > 0 ? deliveryTone(row.ytDelivered, row.ytAgreed) : 'empty';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
      <Chip tone={tone}>{label}</Chip>
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        title={expanded ? 'Hide Reels/YouTube breakdown' : 'Show Reels/YouTube breakdown'}
        style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', padding: '4px 4px 4px 8px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, width: 46 }}>
          <MiniBar pct={row.reelsAgreed > 0 ? (row.reelsDelivered / row.reelsAgreed) * 100 : 0} tone={reelsTone} />
          <MiniBar pct={row.ytAgreed > 0 ? (row.ytDelivered / row.ytAgreed) * 100 : 0} tone={ytTone} />
        </div>
        <Chevron expanded={expanded} />
      </button>
    </div>
  );
}

function FootageChip({ row }: { row: ClientRow }) {
  if (row.reelsAgreed + row.ytAgreed <= 0) return <Chip tone="none">N/A</Chip>;
  if (row.stillNeeded <= 0) return <Chip tone="none">Quota met</Chip>;
  if (row.footageGap > 0) return <Chip tone="bad">Short by {row.footageGap}</Chip>;
  return <Chip tone="good">Buffer +{Math.abs(row.footageGap)}</Chip>;
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
// Scoped to the Clients tab breakdown table — its header stays pinned while
// scrolling a long client list, so column meaning is never out of view.
const thStickyStyle: React.CSSProperties = { ...thStyle, position: 'sticky', top: 0, zIndex: 1 };
const thStickyNum: React.CSSProperties = { ...thStickyStyle, textAlign: 'center' };
const td: React.CSSProperties = { padding: '11px 18px', borderBottom: '1px solid #e7ebef', verticalAlign: 'middle' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'center', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' };

const PIPELINE_GROUPS = ['To do', 'In progress', 'Quality check', 'Review & ship'];

export function DashboardTabs({ approvals, clients, editors, pipeline, attentionClients, topEditors, statusTasks, agreedVsDelivered, periodLabel, defaultTab }: Props) {
  const [activeTab, setActiveTab] = useState<'overview' | 'approvals' | 'clients' | 'editors'>(
    (defaultTab as 'approvals') ?? 'overview'
  );
  const [approvalSearch, setApprovalSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [editorSearch, setEditorSearch] = useState('');
  const [drillStage, setDrillStage] = useState<PipelineStage | null>(null);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(new Set());

  function toggleClientExpanded(name: string) {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

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

  const drillTasks = drillStage
    ? statusTasks.filter(t => t.status.toLowerCase().replace(/\s+/g, ' ').trim() === drillStage.key)
    : [];

  return (
    <div>
      {/* Pipeline drill-down slide-over */}
      {drillStage && (
        <>
          <div onClick={() => setDrillStage(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,28,40,0.35)', zIndex: 400 }} />
          <div style={{
            position: 'fixed', right: 0, top: 0, bottom: 0,
            width: 420, maxWidth: '92vw',
            background: '#fff', zIndex: 401,
            display: 'flex', flexDirection: 'column',
            boxShadow: '-4px 0 32px rgba(0,0,0,0.15)',
            animation: 'db-slide-in 180ms ease',
          }}>
            {/* Header */}
            <div style={{ padding: '16px 18px', borderBottom: '1px solid #e7ebef', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: drillStage.barColor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#111c28' }}>{drillStage.label}</div>
                <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 1 }}>{drillTasks.length} video{drillTasks.length !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setDrillStage(null)} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e7ebef', background: '#f5f7f9', cursor: 'pointer', display: 'grid', placeItems: 'center', color: '#54616f', fontSize: 16, fontFamily: 'inherit' }}>×</button>
            </div>

            {/* Task list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {drillTasks.length === 0 ? (
                <div style={{ padding: '40px 0', textAlign: 'center', color: '#8b97a4', fontSize: 13 }}>No videos in this stage</div>
              ) : drillTasks.map(t => (
                <div key={t.id} style={{ background: '#f8fafc', border: '1px solid #e7ebef', borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ width: 34, height: 22, borderRadius: 5, flexShrink: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg,#2c3540,#4a5562)', marginTop: 2 }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" style={{width:11,height:11,opacity:.8}}><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111c28', lineHeight: 1.3, marginBottom: 3 }}>{t.title}</div>
                    <div style={{ fontSize: 11.5, color: '#8b97a4', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {t.clientName && <span>{t.clientName}</span>}
                      {t.amName && <span>· {t.amName}</span>}
                    </div>
                  </div>
                  {t.frameLink && (
                    <a href={t.frameLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 600, color: '#5b6bff', textDecoration: 'none', flexShrink: 0, marginTop: 2 }}>Frame.io ↗</a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}

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
              <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', display: 'flex', alignItems: 'center', gap: 6 }}>
                Production pipeline
                <InfoPopover tip="Tasks grouped by phase. Each count shows how many videos are currently at that stage." />
              </h3>
              <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Click a stage to see videos in that status</div>
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
                        onClick={() => setDrillStage(stage)}
                        style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '7px 9px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', width: '100%', cursor: stage.count > 0 ? 'pointer' : 'default', textAlign: 'left', transition: 'background 130ms', fontFamily: 'inherit' }}
                        onMouseEnter={e => { if (stage.count > 0) e.currentTarget.style.background = '#f5f7f9'; }}
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

        {/* Agreed vs. Delivered */}
        <div style={{ marginTop: 14 }}>
          <AgreedVsDeliveredChart rows={agreedVsDelivered} periodLabel={periodLabel} />
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
                  <th style={thNum}>Waiting <InfoPopover tip="Days since this video last changed status." /></th>
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
                  <th style={thStickyStyle}>Client</th>
                  <th style={thStickyNum}>Total</th>
                  <th style={thStickyNum}>In review <InfoPopover tip="Videos currently in 'For Client Review' status, waiting for client response." /></th>
                  <th style={thStickyNum}>Oldest wait <InfoPopover tip="Days since the oldest unreviewed video last changed status." /></th>
                  <th style={thStickyNum}>Status <InfoPopover tip="On track = no pending reviews · In review = 1+ video awaiting client · Needs attention = waiting >3 days." /></th>
                  <th style={thStickyNum}>Delivery <InfoPopover tip="Combined % = (Reels + YouTube delivered) ÷ (Reels + YouTube agreed) from ClickUp's Master Clients List, prorated for the selected period. Click a row to see the Reels/YouTube breakdown." /></th>
                  <th style={thStickyNum}>Footage <InfoPopover tip="Still needed (agreed − delivered, summed across Reels + YouTube) compared to backlog on hand. 'Short by N' means raw footage on hand won't cover the remaining quota — film more or pull from the Marketplace." /></th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.map(c => {
                  const expanded = expandedClients.has(c.name);
                  return (
                    <Fragment key={c.name}>
                    <tr style={{ borderBottom: expanded ? 'none' : '1px solid #e7ebef' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{c.name}</td>
                      <td style={tdNum}>{c.total}</td>
                      <td style={tdNum}>{c.inReview > 0 ? <span style={{ fontWeight: 600, color: c.oldestDays > 3 ? '#a86a00' : '#2563eb' }}>{c.inReview}</span> : <span style={{ color: '#8b97a4' }}>—</span>}</td>
                      <td style={tdNum}>{c.inReview > 0 ? <WaitBadge days={c.oldestDays} /> : <span style={{ color: '#8b97a4' }}>—</span>}</td>
                      <td style={tdNum}><StatusChip inReview={c.inReview} oldestDays={c.oldestDays} /></td>
                      <td style={tdNum}><DeliveryCell row={c} expanded={expanded} onToggle={() => toggleClientExpanded(c.name)} /></td>
                      <td style={tdNum}><FootageChip row={c} /></td>
                    </tr>
                    {expanded && (
                      <tr style={{ borderBottom: '1px solid #e7ebef' }}>
                        <td colSpan={7} style={{ padding: '4px 18px 14px 46px', background: '#fafbfc' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 28 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 140 }}>
                              <span style={{ fontSize: 11, color: '#8b97a4', fontWeight: 600 }}>Reels / mo</span>
                              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {c.reelsAgreed > 0 ? `${c.reelsDelivered} / ${c.reelsAgreed}` : <span style={{ color: '#8b97a4', fontWeight: 400 }}>No quota set</span>}
                              </span>
                              <MiniBar pct={c.reelsAgreed > 0 ? (c.reelsDelivered / c.reelsAgreed) * 100 : 0} tone={c.reelsAgreed > 0 ? deliveryTone(c.reelsDelivered, c.reelsAgreed) : 'empty'} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 140 }}>
                              <span style={{ fontSize: 11, color: '#8b97a4', fontWeight: 600 }}>YouTube / mo</span>
                              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                {c.ytAgreed > 0 ? `${c.ytDelivered} / ${c.ytAgreed}` : <span style={{ color: '#8b97a4', fontWeight: 400 }}>No quota set</span>}
                              </span>
                              <MiniBar pct={c.ytAgreed > 0 ? (c.ytDelivered / c.ytAgreed) * 100 : 0} tone={c.ytAgreed > 0 ? deliveryTone(c.ytDelivered, c.ytAgreed) : 'empty'} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 140 }}>
                              <span style={{ fontSize: 11, color: '#8b97a4', fontWeight: 600 }}>Backlog on hand</span>
                              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.backlogCount} raw video{c.backlogCount === 1 ? '' : 's'}</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 140 }}>
                              <span style={{ fontSize: 11, color: '#8b97a4', fontWeight: 600 }}>Still needed</span>
                              <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: c.footageGap > 0 ? '#cf3f36' : '#111c28' }}>
                                {c.reelsAgreed + c.ytAgreed <= 0
                                  ? 'No quota to measure against'
                                  : c.stillNeeded <= 0
                                    ? '0 — quota already met'
                                    : `${c.stillNeeded} video${c.stillNeeded === 1 ? '' : 's'} → ${c.footageGap > 0 ? `short by ${c.footageGap}` : `buffer +${Math.abs(c.footageGap)}`}`}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
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
    </div>
  );
}
