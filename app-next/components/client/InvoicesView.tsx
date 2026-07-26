'use client';

import { useMemo, useState } from 'react';
import type { Invoice, InvoiceStatus } from '@/lib/quickbooks';

const STATUS_TONE: Record<InvoiceStatus, { fg: string; bg: string }> = {
  Paid:    { fg: '#14805f', bg: '#e4f3ec' },
  Pending: { fg: '#b06f06', bg: '#fbeecf' },
  Overdue: { fg: '#cf3f36', bg: '#fbe4e2' },
  Draft:   { fg: '#6c6357', bg: '#f1ebe1' },
};

const fmtMoney = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 });
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysUntil(iso: string) {
  return Math.round((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
}

function downloadInvoice(inv: Invoice) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inv.id}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:640px;margin:40px auto;color:#221e18}
      h1{font-size:20px;margin-bottom:4px} .muted{color:#9d9488;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:24px}
      th,td{text-align:left;padding:10px 0;border-bottom:1px solid #ece4d8;font-size:14px}
      .amt{text-align:right} .total{font-weight:700;font-size:16px}
      .brand{color:#FF6000;font-weight:800}
    </style></head><body>
    <div class="brand">LEGACY MEDIA</div>
    <h1>Invoice ${inv.id}</h1>
    <div class="muted">Bill to: ${inv.clientName}</div>
    <div class="muted">Issued ${fmtDate(inv.date)} · Due ${fmtDate(inv.due)} · Status: ${inv.status}</div>
    <table><tr><th>Description</th><th class="amt">Amount</th></tr>
    <tr><td>${inv.description}</td><td class="amt">${fmtMoney(inv.amount)}</td></tr>
    <tr><td class="total">Total</td><td class="amt total">${fmtMoney(inv.amount)}</td></tr>
    </table>
    <p class="muted" style="margin-top:32px">This is a sample export generated from dummy data. Once QuickBooks is connected, this will be the real QBO invoice PDF.</p>
    </body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${inv.id}-${inv.clientName.replace(/\s+/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function InvoicesView({ invoices, connected }: { invoices: Invoice[]; connected: boolean }) {
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [sort, setSort] = useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');

  const rows = useMemo(() => {
    const list = status === 'all' ? invoices.slice() : invoices.filter(i => i.status === status);
    list.sort((a, b) => {
      if (sort === 'date-desc') return b.date.localeCompare(a.date);
      if (sort === 'date-asc') return a.date.localeCompare(b.date);
      if (sort === 'amount-desc') return b.amount - a.amount;
      return a.amount - b.amount;
    });
    return list;
  }, [invoices, status, sort]);

  const due = invoices.filter(i => i.status === 'Pending' || i.status === 'Overdue').reduce((s, i) => s + i.amount, 0);
  const overdueCount = invoices.filter(i => i.status === 'Overdue').length;
  const pendingCount = invoices.filter(i => i.status === 'Pending').length;
  const paidCount = invoices.filter(i => i.status === 'Paid').length;

  const statuses: (InvoiceStatus | 'all')[] = ['all', 'Paid', 'Pending', 'Overdue'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Balance card */}
      <div style={{ background: '#221e18', color: '#fff', borderRadius: 20, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Amount due</div>
        <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' as const }}>{fmtMoney(due)}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#6adf9b' : 'rgba(255,255,255,.4)' }} />
          {connected ? 'Synced from QuickBooks' : 'Sample data — QuickBooks sync coming soon'}
        </div>
        <div style={{ display: 'flex', gap: 10, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.14)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', fontWeight: 600 }}>OVERDUE</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2, color: overdueCount ? '#ff9d8f' : '#fff' }}>{overdueCount}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', fontWeight: 600 }}>PENDING</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{pendingCount}</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', fontWeight: 600 }}>PAID</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 2 }}>{paidCount}</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {statuses.map(s => {
          const on = status === s;
          return (
            <button
              type="button"
              key={s}
              onClick={() => setStatus(s)}
              style={{
                flexShrink: 0, fontSize: 12.5, fontWeight: 700, padding: '7px 13px', borderRadius: 100, cursor: 'pointer',
                background: on ? '#221e18' : '#fff', color: on ? '#fff' : '#6c6357',
                border: on ? '1px solid #221e18' : '1px solid #ece4d8',
              }}
            >
              {s === 'all' ? 'All' : s}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#9d9488', fontWeight: 600 }}>{rows.length} invoice{rows.length === 1 ? '' : 's'}</span>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as typeof sort)}
          style={{ fontSize: 12, fontWeight: 700, color: '#6c6357', background: '#fff', border: '1px solid #ece4d8', borderRadius: 8, padding: '6px 8px', fontFamily: 'inherit' }}
        >
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Amount: high → low</option>
          <option value="amount-asc">Amount: low → high</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 10px', color: '#9d9488', fontSize: 13 }}>No invoices match this filter.</div>
      ) : rows.map(r => {
        const tone = STATUS_TONE[r.status];
        return (
          <div key={r.id} style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 22, padding: 15, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#9d9488', fontWeight: 600 }}>{r.id} · {fmtDate(r.date)}</div>
                <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.25, marginTop: 3 }}>{r.description}</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, whiteSpace: 'nowrap' }}>{fmtMoney(r.amount)}</div>
            </div>
            <div style={{ fontSize: 12, color: '#9d9488', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7 }}>
              Due {fmtDate(r.due)}
              {r.status === 'Overdue' && (
                <>
                  <span style={{ width: 3, height: 3, borderRadius: '50%', background: '#9d9488' }} />
                  <span style={{ color: '#cf3f36', fontWeight: 700 }}>{Math.abs(daysUntil(r.due))}d overdue</span>
                </>
              )}
            </div>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 9, color: tone.fg, background: tone.bg, width: 'fit-content' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg }} />
              {r.status === 'Pending' ? 'Awaiting payment' : r.status}
            </span>
            <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
              <button
                type="button"
                onClick={() => downloadInvoice(r)}
                style={{ flex: 1, fontSize: 13, fontWeight: 700, borderRadius: 13, padding: '10px 12px', border: '1px solid #ece4d8', background: '#f7f1ea', color: '#221e18', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                Download
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
