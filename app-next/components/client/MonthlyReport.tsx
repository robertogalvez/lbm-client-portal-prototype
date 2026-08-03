'use client';

import { useMemo, useState } from 'react';
import { resolveMonthAgreement, fulfilment, beyondContract, type MonthAgreement } from '@/lib/contracts';
import type { ContractPeriod, ContractMonth } from '@/lib/db/schema';

// One task belonging to this client, as read from video_cache/ClickUp.
export interface ReportTask {
  clickupTaskId: string;
  title: string;
  status: string;
  deliverableType: 'short_form' | 'youtube' | 'ad';
  datePosted: string | null; // ms timestamp or ISO string — dateUpdated, or publishDate once posted
  frameLink: string | null;
  instagramUrl: string | null;
}

interface Props {
  clientName: string;
  periods: ContractPeriod[]; // every contract period on file for this client, oldest first
  monthRows: ContractMonth[]; // every contract_months deviation row across those periods
  tasks: ReportTask[]; // every task for this client, any status
}

// Report palette (§10) — deliberately warmer than the dashboard's. Do not unify.
const BG = '#efe9e0';
const SURFACE = '#ffffff';
const CREAM = '#faf6f0';
const INK = '#221e18';
const INK2 = '#6c6357';
const INK3 = '#9d9488';
const LINE = '#ece4d8';
const BRAND = '#FF6000';

const EDITING_STATUSES = new Set(['qc final - am', 'tc - qc (somu)', 'in progress (corrections)', 'in progress (editor)']);
const RAW_STATUSES = new Set(['not ready', 'backlog', 'not assigned', 'not posted - discarded', 'archived']);

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function toDate(v: string | null): Date | null {
  if (!v) return null;
  const n = Number(v);
  const d = new Date(isNaN(n) ? v : n);
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(v: string | null): string {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}
function monthKeyOf(v: string | null): string | null {
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function findPeriodForMonth(periods: ContractPeriod[], month: string): ContractPeriod | null {
  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1).getTime();
  const monthEnd = new Date(y, m, 0).getTime();
  return periods.find(p => {
    const starts = new Date(p.startsOn).getTime();
    const ends = p.endsOn ? new Date(p.endsOn).getTime() : Infinity;
    return starts <= monthEnd && ends >= monthStart;
  }) ?? null;
}

function currentPeriod(periods: ContractPeriod[]): ContractPeriod | null {
  const active = periods.find(p => p.state === 'active' || p.state === 'extended');
  return active ?? periods[periods.length - 1] ?? null;
}

function StatCard({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 12, padding: '14px 16px', background: SURFACE, breakInside: 'avoid' }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: INK3 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? INK, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function ScopeRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '9px 0', borderBottom: `1px solid ${LINE}`, fontSize: 13.5 }}>
      <span style={{ color: INK2 }}>{label}</span>
      <span style={{ fontWeight: 700, textAlign: 'right' }}>{value}</span>
    </div>
  );
}

function ReportLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: BRAND, textDecoration: 'none', fontWeight: 700, fontSize: 11.5 }}>{label} ↗</a>
  );
}

export function MonthlyReport({ clientName, periods, monthRows, tasks }: Props) {
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      const k = monthKeyOf(t.datePosted);
      if (k) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [tasks]);

  const [month, setMonth] = useState<string>('all');

  const isMonthScoped = month !== 'all';
  const activePeriod = currentPeriod(periods);
  const scopedPeriod = isMonthScoped ? findPeriodForMonth(periods, month) : activePeriod;

  const monthRow = scopedPeriod ? monthRows.find(r => r.periodId === scopedPeriod.id && r.month === month) ?? null : null;
  const agreement: MonthAgreement | null = isMonthScoped && scopedPeriod ? resolveMonthAgreement(scopedPeriod, monthRow, month) : null;

  // Client-facing scope: raw/backlog/discarded stages never reach the client
  // (§5.6 — strip Backlog/Discarded and internal-only stages from the report).
  const clientFacingTasks = tasks.filter(t => !RAW_STATUSES.has(norm(t.status)));
  const scopedTasks = isMonthScoped
    ? clientFacingTasks.filter(t => monthKeyOf(t.datePosted) === month)
    : clientFacingTasks;

  const published = (isMonthScoped ? scopedTasks : clientFacingTasks.filter(t => {
    if (!activePeriod) return norm(t.status) === 'posted in socials';
    const d = toDate(t.datePosted);
    return norm(t.status) === 'posted in socials' && d !== null && d.getTime() >= new Date(activePeriod.startsOn).getTime();
  })).filter(t => norm(t.status) === 'posted in socials').length;

  const pendingReview = scopedTasks.filter(t => norm(t.status) === 'for client review').length;
  const editing = scopedTasks.filter(t => EDITING_STATUSES.has(norm(t.status))).length;
  const onHold = 0; // no live "on hold" ClickUp status exists today (see DashboardTabs.tsx)

  const contracted = isMonthScoped ? (agreement && agreement.kind !== 'none' ? agreement.quota : null) : (activePeriod?.contractedTotal ?? null);
  const fulfilmentFrac = contracted !== null ? fulfilment(published, contracted) : null;
  const beyond = contracted !== null ? beyondContract(published, contracted) : 0;
  const remaining = Math.max(0, -beyond);

  const deliverableMix = new Map<string, number>();
  for (const t of scopedTasks) {
    if (norm(t.status) !== 'posted in socials') continue;
    deliverableMix.set(t.deliverableType, (deliverableMix.get(t.deliverableType) ?? 0) + 1);
  }

  const heroLabel = isMonthScoped ? 'Delivered this month' : 'Delivery progress';
  const scopeLabel = isMonthScoped ? 'Your agreement' : 'Contract scope';
  const ledgerLabel = isMonthScoped ? 'Content delivered this month' : 'Content ledger';
  const monthText = isMonthScoped ? monthLabel(month) : 'All time';

  const ledgerGroups = [
    { key: 'review', label: 'Pending your review', rows: scopedTasks.filter(t => norm(t.status) === 'for client review') },
    { key: 'editing', label: 'In editing', rows: scopedTasks.filter(t => EDITING_STATUSES.has(norm(t.status))) },
    { key: 'posted', label: 'Published to socials', rows: scopedTasks.filter(t => norm(t.status) === 'posted in socials' && t.deliverableType === 'short_form') },
    { key: 'youtube', label: 'YouTube published', rows: scopedTasks.filter(t => norm(t.status) === 'posted in socials' && t.deliverableType === 'youtube') },
    { key: 'ads', label: 'Ads delivered', rows: scopedTasks.filter(t => norm(t.status) === 'posted in socials' && t.deliverableType === 'ad') },
  ].filter(g => g.rows.length > 0);

  // Composed strictly from the same tokens used in the hero/stat cards above
  // (§7.5a) — never a hand-typed number in this sentence.
  const nextSteps: string[] = [];
  if (pendingReview > 0) nextSteps.push(`${pendingReview} video${pendingReview === 1 ? '' : 's'} awaiting your review`);
  if (editing > 0) nextSteps.push(`${editing} in active editing`);
  if (remaining > 0) nextSteps.push(`${remaining} remaining to fulfill the current agreement`);
  if (nextSteps.length === 0) nextSteps.push('No open items this period');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, background: BG, padding: '20px', borderRadius: 16 }}>
      {/* Controls (screen only) */}
      <div className="noprint" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <select
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{ fontSize: 13, fontWeight: 700, color: INK, background: SURFACE, border: `1px solid ${LINE}`, borderRadius: 10, padding: '8px 12px', fontFamily: 'inherit' }}
        >
          <option value="all">All time</option>
          {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
        </select>
        <button
          type="button"
          onClick={() => window.print()}
          style={{ fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: '8px 12px', border: `1px solid ${LINE}`, background: '#f7f1ea', color: INK, cursor: 'pointer' }}
        >
          Print / Save PDF
        </button>
      </div>

      {/* Letterhead */}
      <div style={{ background: SURFACE, borderRadius: 16, padding: '20px 24px', borderBottom: `2px solid ${INK}` }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '0.02em' }}>Legacy Building Media</div>
      </div>

      {/* Title block */}
      <div style={{ background: SURFACE, borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK3 }}>Delivery report</div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>{clientName}</div>
        <div style={{ fontSize: 14, color: INK2, marginTop: 4 }}>{monthText}</div>
      </div>

      {/* Delivery hero */}
      <div style={{ background: SURFACE, borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK3, marginBottom: 10 }}>{heroLabel}</div>
        {contracted === null ? (
          <div style={{ fontSize: 32, fontWeight: 800 }}>{published}</div>
        ) : (
          <>
            <div style={{ fontSize: 32, fontWeight: 800 }}>
              {published} / {contracted}{fulfilmentFrac !== null && ` · ${Math.round(fulfilmentFrac * 100)}%`}
            </div>
            <div style={{ height: 10, borderRadius: 100, background: CREAM, overflow: 'hidden', marginTop: 10 }}>
              <div style={{ width: `${Math.min(100, (published / Math.max(1, contracted)) * 100)}%`, height: '100%', background: BRAND, borderRadius: 100 }} />
            </div>
            <div style={{ fontSize: 13, color: INK2, marginTop: 8 }}>
              {beyond > 0 ? `Over-delivered — ${beyond} videos beyond the contracted scope of ${contracted}` : `${remaining} remaining to fulfill the contract`}
            </div>
          </>
        )}
        {agreement?.kind === 'part' && (
          <div style={{ fontSize: 12, color: INK3, marginTop: 6, fontStyle: 'italic' }}>part month — {agreement.daysUnderContract} of {agreement.daysInMonth} days under contract</div>
        )}
      </div>

      {/* Production breakdown */}
      <div style={{ background: SURFACE, borderRadius: 16, padding: '24px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK3, marginBottom: 12 }}>Production breakdown</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <StatCard label="Contracted" value={contracted ?? 0} />
          <StatCard label="Published" value={published} color="#14805f" />
          <StatCard label="Pending review" value={pendingReview} color={pendingReview > 0 ? '#a86a00' : undefined} />
          <StatCard label="In editing" value={editing} color={editing > 0 ? '#2563eb' : undefined} />
          <StatCard label="On hold" value={onHold} />
          <StatCard label="Beyond contract" value={Math.max(0, beyond)} color={beyond > 0 ? BRAND : undefined} />
        </div>
      </div>

      {/* Contract scope — hidden entirely when month-scoped and no agreement applies to this month at all */}
      {(scopedPeriod || !isMonthScoped) && (
        <div style={{ background: SURFACE, borderRadius: 16, padding: '24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK3, marginBottom: 10 }}>{scopeLabel}</div>
          {scopedPeriod ? (
            <>
              <ScopeRow label="Delivery model" value={scopedPeriod.model === 'package' ? 'Package' : 'Monthly delivery'} />
              {scopedPeriod.cadencePerWeek != null && <ScopeRow label="Publishing cadence" value={`${scopedPeriod.cadencePerWeek}×/week`} />}
              <ScopeRow label="Contract period" value={`${fmtDate(scopedPeriod.startsOn)} – ${scopedPeriod.endsOn ? fmtDate(scopedPeriod.endsOn) : 'Open'}`} />
              <ScopeRow label="Original scope" value={`${scopedPeriod.contractedTotal} deliverables`} />
              {(scopedPeriod.carriedIn ?? 0) > 0 && <ScopeRow label="Carried in" value={`${scopedPeriod.carriedIn} from prior contract`} />}
            </>
          ) : (
            <div style={{ fontSize: 13, fontStyle: 'italic', color: INK3 }}>No agreement on file for {monthText}.</div>
          )}
        </div>
      )}

      {/* Deliverable mix */}
      {deliverableMix.size > 0 && (
        <div style={{ background: SURFACE, borderRadius: 16, padding: '24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK3, marginBottom: 10 }}>Deliverable mix</div>
          {Array.from(deliverableMix.entries()).map(([type, count]) => (
            <ScopeRow key={type} label={type === 'short_form' ? 'Short-form' : type === 'youtube' ? 'YouTube' : 'Ads'} value={`${count} delivered`} />
          ))}
        </div>
      )}

      {/* Content ledger */}
      <div style={{ background: SURFACE, borderRadius: 16, padding: '24px', breakInside: 'avoid' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: INK3, marginBottom: 10 }}>{ledgerLabel}</div>
        {ledgerGroups.length === 0 ? (
          <div style={{ fontSize: 13.5, color: INK3, fontStyle: 'italic' }}>No videos in this period.</div>
        ) : ledgerGroups.map(g => (
          <div key={g.key} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: INK2, marginBottom: 6 }}>{g.label} ({g.rows.length})</div>
            {g.rows
              .slice()
              .sort((a, b) => (toDate(b.datePosted)?.getTime() ?? 0) - (toDate(a.datePosted)?.getTime() ?? 0))
              .map(r => (
                <div key={r.clickupTaskId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: `1px solid ${LINE}` }}>
                  <span style={{ width: 92, fontSize: 12, color: INK3, flexShrink: 0 }}>{fmtDate(r.datePosted)}</span>
                  <span style={{ flex: 1, fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {/* Client-facing filtering (§5.6): only Frame.io ("Review") and published ("Live") links — no ClickUp links go to the client. */}
                  {r.frameLink && <ReportLink href={r.frameLink} label="Review" />}
                  {r.instagramUrl && <ReportLink href={r.instagramUrl} label="Live" />}
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Recommended next steps — contract-level guidance, hidden in month mode (§7.9a) */}
      {!isMonthScoped && (
        <div style={{ background: '#fff1e8', border: '1px solid #ffdfcb', borderRadius: 16, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#B23E00', marginBottom: 8 }}>Recommended next steps</div>
          <div style={{ fontSize: 14, lineHeight: 1.6, color: '#334155' }}>{nextSteps.join(' · ')}.</div>
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: INK3, padding: '4px 4px 0' }}>
        <span>Legacy Building Media</span>
        <span>Prepared {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>

      <style>{`@media print { .noprint { display: none !important; } }`}</style>
    </div>
  );
}
