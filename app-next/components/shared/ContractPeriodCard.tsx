'use client';

import { useState, type ReactNode } from 'react';
import { linkBtn } from './contractFormStyles';

export interface ContractMonthRecord {
  id: string;
  periodId: string;
  lineItemId: string | null;
  month: string;
  active: boolean;
  quotaOverride: number | null;
  scopeNote: string | null;
  amended: boolean;
  note: string | null;
}

export interface ContractLineItemRecord {
  id: string;
  periodId: string;
  deliverableType: string;
  contractedTotal: number;
  monthlyQuota: number | null;
  carriedIn: number | null;
}

export interface ContractPeriodRecord {
  id: string;
  clientId: string;
  label: string;
  startsOn: string;
  endsOn: string | null;
  model: string;
  cadencePerWeek: number | null;
  monthlyQuota: number | null;
  contractedTotal: number;
  state: string;
  carriedIn: number | null;
  notes: string | null;
  renewedFromPeriodId: string | null;
  dataQualityFlag: string | null;
  cycleDurationDays: number | null;
  cycleAnchorDate: string | null;
  months: ContractMonthRecord[];
  lineItems: ContractLineItemRecord[];
  clientIds: string[];
}

// One period's read view — label, dates or rolling-cycle status, model,
// state, aggregate total, itemized line items, month deviations, and a
// data-quality banner when flagged. Extracted from what used to be inline
// JSX in ClientEditPanel so the "Renew" flow (which needs to render a
// period's summary inside the renewal-preview panel too) doesn't duplicate
// this markup.
export function ContractPeriodCard({
  period, clientNames, isCurrent, deleting, onEdit, onDelete, onRenew, monthsSection,
}: {
  period: ContractPeriodRecord;
  clientNames: string[]; // resolved names for period.clientIds, joint contracts show "A & B"
  isCurrent: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRenew: () => void;
  monthsSection: ReactNode;
}) {
  // Lazy-init so "now" is captured once per mount, not recomputed as an
  // impure call during render.
  const [now] = useState(() => new Date());
  const rollingCycle = period.cycleDurationDays != null;
  const cycleEndsOn = rollingCycle && period.cycleAnchorDate
    ? new Date(new Date(period.cycleAnchorDate).getTime() + period.cycleDurationDays! * 86_400_000)
    : null;
  const daysLeft = cycleEndsOn ? Math.ceil((cycleEndsOn.getTime() - now.getTime()) / 86_400_000) : null;

  return (
    <div style={{ background: '#f4f6f8', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: '#111c28' }}>{period.label}</span>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, color: '#54616f', background: '#e7ebef', textTransform: 'capitalize' }}>{period.state}</span>
      </div>

      {clientNames.length > 1 && (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed', marginTop: 4 }}>Joint contract: {clientNames.join(' & ')}</div>
      )}

      {rollingCycle ? (
        <div style={{ fontSize: 12, color: '#54616f', marginTop: 4 }}>
          Rolling {period.cycleDurationDays}-day cycle · {period.cycleAnchorDate
            ? `started ${period.cycleAnchorDate}, ${daysLeft != null && daysLeft >= 0 ? `${daysLeft}d left` : 'expired — renew'}`
            : 'waiting for first published video'}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#54616f', marginTop: 4 }}>
          {period.startsOn} → {period.endsOn ?? 'open-ended'} · {period.model}{period.cadencePerWeek ? ` · ${period.cadencePerWeek}x/week` : ''}
        </div>
      )}

      <div style={{ fontSize: 12, color: '#54616f', marginTop: 2 }}>
        {period.monthlyQuota != null ? `${period.monthlyQuota}/mo` : 'no standing quota'} · {period.contractedTotal} contracted{period.carriedIn ? ` (+${period.carriedIn} carried in)` : ''}
      </div>

      {period.lineItems.length > 0 && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {period.lineItems.map(li => (
            <div key={li.id} style={{ fontSize: 11.5, color: '#54616f' }}>
              {li.deliverableType}: {li.contractedTotal} contracted{li.monthlyQuota != null ? ` (${li.monthlyQuota}/mo)` : ''}{li.carriedIn ? ` +${li.carriedIn} carried in` : ''}
            </div>
          ))}
        </div>
      )}

      {period.dataQualityFlag && (
        <div style={{ fontSize: 11.5, color: '#b06f06', background: '#fdf3e1', borderRadius: 6, padding: '5px 8px', marginTop: 6 }}>
          ⚠ {period.dataQualityFlag}
        </div>
      )}

      {period.notes && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>{period.notes}</div>}

      <div style={{ display: 'flex', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
        <button type="button" onClick={onEdit} style={linkBtn}>Edit</button>
        <button type="button" onClick={onDelete} disabled={deleting} style={{ ...linkBtn, color: '#cf3f36' }}>{deleting ? 'Deleting…' : 'Delete'}</button>
        {isCurrent && (
          <button type="button" onClick={onRenew} style={linkBtn}>Renew this contract</button>
        )}
      </div>

      {monthsSection}
    </div>
  );
}
