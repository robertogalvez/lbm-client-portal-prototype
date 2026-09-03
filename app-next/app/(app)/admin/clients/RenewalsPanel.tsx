'use client';

import { useEffect, useState } from 'react';

interface RenewalRow {
  periodId: string;
  label: string;
  clientNames: string[];
  cycleDurationDays: number;
  cycleAnchorDate: string | null;
  cycleEndsOn: string | null;
  daysLeft: number | null;
}

// Amendment B's "which rolling-cycle contracts need renewing" control panel
// — every active/extended period in rolling-cycle mode, sorted soonest-to-
// expire first, so the AM doesn't have to work this out client by client.
// Clicking a row opens that client's drawer, where "Renew this contract" on
// the period card does the actual renewal.
export function RenewalsPanel({ onOpenClient }: { onOpenClient: (clientName: string) => void }) {
  const [rows, setRows] = useState<RenewalRow[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/contracts/renewals')
      .then(r => r.ok ? r.json() : { periods: [] })
      .then(data => setRows(data.periods ?? []))
      .catch(() => setRows([]));
  }, []);

  if (!rows || rows.length === 0) return null;

  const overdue = rows.filter(r => r.daysLeft != null && r.daysLeft <= 0).length;
  const soon = rows.filter(r => r.daysLeft != null && r.daysLeft > 0 && r.daysLeft <= 7).length;

  return (
    <div style={{ margin: '0 28px 16px', background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#111c28' }}>Rolling-cycle renewals</span>
          {overdue > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, color: '#fff', background: '#cf3f36' }}>{overdue} overdue</span>}
          {soon > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 100, color: '#b06f06', background: '#fdf3e1' }}>{soon} due within 7d</span>}
        </div>
        <span style={{ fontSize: 12, color: '#8b97a4' }}>{open ? 'Hide' : 'Show'} ({rows.length})</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #e7ebef' }}>
          {rows.map(r => {
            const waiting = r.cycleAnchorDate == null;
            const overdueRow = r.daysLeft != null && r.daysLeft <= 0;
            return (
              <button
                key={r.periodId}
                type="button"
                onClick={() => onOpenClient(r.clientNames[0])}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 18px', background: 'none', border: 'none', borderTop: '1px solid #f4f6f8', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111c28' }}>{r.clientNames.join(' & ')} · {r.label}</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>
                    {waiting
                      ? `${r.cycleDurationDays}-day cycle · waiting for first published video`
                      : `Started ${r.cycleAnchorDate} · ends ${r.cycleEndsOn}`}
                  </div>
                </div>
                {!waiting && (
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 9px', borderRadius: 100, color: overdueRow ? '#cf3f36' : '#54616f', background: overdueRow ? '#fef2f1' : '#f4f6f8' }}>
                    {overdueRow ? 'Renew now' : `${r.daysLeft}d left`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
