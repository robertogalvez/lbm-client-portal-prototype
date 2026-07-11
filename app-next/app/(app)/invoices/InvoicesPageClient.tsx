'use client';

import { useMemo, useState } from 'react';
import type { Invoice, InvoiceStatus } from '@/lib/quickbooks';

const STATUS_TONE: Record<InvoiceStatus, { fg: string; bg: string }> = {
  Paid:    { fg: '#14805f', bg: '#e6f4ee' },
  Pending: { fg: '#a86a00', bg: '#fbf1dc' },
  Overdue: { fg: '#cf3f36', bg: '#fdedeb' },
  Draft:   { fg: '#54616f', bg: '#eef1f4' },
};

const AVATAR_COLORS = ['#5e6b7a', '#5172c4', '#b58236', '#7c66c4', '#cf5b53', '#14805f', '#b06f06'];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
const fmtMoney = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0 });
const fmtDate = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
function daysUntil(iso: string) {
  return Math.round((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86_400_000);
}

function downloadInvoice(inv: Invoice) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${inv.id}</title>
    <style>
      body{font-family:Arial,sans-serif;max-width:640px;margin:40px auto;color:#111c28}
      h1{font-size:20px;margin-bottom:4px} .muted{color:#8b97a4;font-size:13px}
      table{width:100%;border-collapse:collapse;margin-top:24px}
      th,td{text-align:left;padding:10px 0;border-bottom:1px solid #e7ebef;font-size:14px}
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

function exportCSV(rows: Invoice[]) {
  const header = ['Invoice', 'Client', 'Date', 'Due', 'Description', 'Amount', 'Status'];
  const lines = [header.join(',')].concat(rows.map(r => [
    r.id, r.clientName, r.date, r.due, `"${r.description.replace(/"/g, '""')}"`, r.amount, r.status,
  ].join(',')));
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'invoices.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

type SortKey = 'id' | 'clientName' | 'date' | 'due' | 'amount' | 'status';

export function InvoicesPageClient({ invoices, connected }: { invoices: Invoice[]; connected: boolean }) {
  const [search, setSearch] = useState('');
  const [client, setClient] = useState('all');
  const [status, setStatus] = useState<'all' | InvoiceStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const clients = useMemo(() => [...new Set(invoices.map(i => i.clientName))].sort(), [invoices]);

  const filtered = useMemo(() => {
    let rows = invoices.slice();
    if (client !== 'all') rows = rows.filter(r => r.clientName === client);
    if (status !== 'all') rows = rows.filter(r => r.status === status);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter(r => r.id.toLowerCase().includes(q) || r.clientName.toLowerCase().includes(q) || r.description.toLowerCase().includes(q));
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      const av = sortKey === 'amount' ? a.amount : a[sortKey];
      const bv = sortKey === 'amount' ? b.amount : b[sortKey];
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return rows;
  }, [invoices, client, status, search, sortKey, sortDir]);

  const outstanding = invoices.filter(r => r.status === 'Pending' || r.status === 'Overdue').reduce((s, r) => s + r.amount, 0);
  const overdueRows = invoices.filter(r => r.status === 'Overdue');
  const overdueTotal = overdueRows.reduce((s, r) => s + r.amount, 0);
  const paidTotal = invoices.filter(r => r.status === 'Paid').reduce((s, r) => s + r.amount, 0);
  const billedTotal = invoices.reduce((s, r) => s + r.amount, 0);
  const openCount = invoices.filter(r => r.status !== 'Paid' && r.status !== 'Draft').length;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const statuses: (InvoiceStatus | 'all')[] = ['all', 'Paid', 'Pending', 'Overdue', 'Draft'];

  return (
    <main style={{ padding: '28px 32px', maxWidth: 1400 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111c28', margin: 0 }}>Invoices</h1>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
              padding: '4px 9px', borderRadius: 7,
              color: connected ? '#14805f' : '#54616f',
              background: connected ? '#e6f4ee' : '#f5f7f9',
              border: connected ? 'none' : '1px solid #d4dbe2',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: connected ? '#14805f' : '#8b97a4' }} />
              {connected ? 'Synced from QuickBooks' : 'QuickBooks not connected — sample data'}
            </span>
            Every client&apos;s billing in one place
          </p>
        </div>
        <button
          onClick={() => exportCSV(filtered)}
          style={{ fontSize: 13, fontWeight: 600, borderRadius: 8, padding: '9px 14px', border: '1px solid #d4dbe2', background: '#fff', color: '#111c28', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7 }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
          Export CSV
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <KpiCard label="Total Outstanding" value={fmtMoney(outstanding)} accent="#a86a00" sub="pending + overdue" />
        <KpiCard label="Overdue" value={fmtMoney(overdueTotal)} accent="#cf3f36" sub={`${overdueRows.length} invoice${overdueRows.length === 1 ? '' : 's'} past due`} />
        <KpiCard label="Paid" value={fmtMoney(paidTotal)} accent="#14805f" sub="collected to date" />
        <KpiCard label="Total Billed" value={fmtMoney(billedTotal)} accent="#FF6000" sub={`across ${clients.length} clients`} />
      </div>

      {/* Table card */}
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e7ebef' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111c28' }}>All invoices</div>
          <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>{openCount} open · {invoices.length} total</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #e7ebef', background: '#f8f9fb', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180, maxWidth: 320 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 15, height: 15, color: '#8b97a4' }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input
              type="text"
              placeholder="Search invoice #, client, description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', fontSize: 13, color: '#111c28', fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
          </div>
          <select
            value={client}
            onChange={e => setClient(e.target.value)}
            style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', fontSize: 13, color: '#111c28', fontWeight: 500, fontFamily: 'inherit' }}
          >
            <option value="all">All clients</option>
            {clients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <div style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            {statuses.map(s => {
              const on = status === s;
              const tone = s === 'all' ? null : STATUS_TONE[s];
              return (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  style={{
                    fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 100, cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    color: on ? '#fff' : '#54616f',
                    background: on ? '#111c28' : '#fff',
                    border: on ? '1px solid #111c28' : '1px solid #d4dbe2',
                  }}
                >
                  {tone && <span style={{ width: 6, height: 6, borderRadius: '50%', background: on ? '#fff' : tone.fg }} />}
                  {s === 'all' ? 'All statuses' : s}
                </button>
              );
            })}
          </div>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: '#8b97a4', fontWeight: 500, whiteSpace: 'nowrap' }}>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e7ebef', background: '#f8f9fb' }}>
                {([
                  ['id', 'Invoice'], ['clientName', 'Client'], ['date', 'Date'], ['due', 'Due'],
                  [null, 'Description'], ['amount', 'Amount'], ['status', 'Status'], [null, 'Actions'],
                ] as [SortKey | null, string][]).map(([key, label]) => (
                  <th
                    key={label}
                    onClick={key ? () => toggleSort(key) : undefined}
                    style={{
                      textAlign: label === 'Amount' || label === 'Actions' ? 'right' : 'left',
                      padding: '10px 16px', fontWeight: 600, color: '#8b97a4', fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap',
                      cursor: key ? 'pointer' : 'default', userSelect: 'none',
                    }}
                  >
                    {label}{key && sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px 16px', color: '#8b97a4', fontSize: 13 }}>No invoices match these filters.</td></tr>
              ) : filtered.map(r => {
                const tone = STATUS_TONE[r.status];
                const overdueHint = r.status === 'Overdue' ? ` · ${Math.abs(daysUntil(r.due))}d late` : '';
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #f4f6f8' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: '#111c28' }}>{r.id}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 26, height: 26, borderRadius: '50%', background: avatarColor(r.clientName), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, flexShrink: 0 }}>{initials(r.clientName)}</span>
                        <span style={{ fontWeight: 500, color: '#111c28' }}>{r.clientName}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', color: '#54616f' }}>{fmtDate(r.date)}</td>
                    <td style={{ padding: '12px 16px', color: r.status === 'Overdue' ? '#cf3f36' : '#54616f', fontWeight: r.status === 'Overdue' ? 700 : 400 }}>{fmtDate(r.due)}{overdueHint}</td>
                    <td style={{ padding: '12px 16px', color: '#54616f', maxWidth: 260 }}>{r.description}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#111c28' }}>{fmtMoney(r.amount)}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, padding: '4px 10px', borderRadius: 100, color: tone.fg, background: tone.bg }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone.fg }} />
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button
                        onClick={() => downloadInvoice(r)}
                        title="Download"
                        aria-label={`Download invoice ${r.id}`}
                        style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', display: 'inline-grid', placeItems: 'center', color: '#54616f', cursor: 'pointer' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderTop: '1px solid #e7ebef', fontSize: 12, color: '#54616f' }}>
          <span>Showing <b style={{ color: '#111c28' }}>{filtered.length}</b> of <b style={{ color: '#111c28' }}>{invoices.length}</b> invoices</span>
          <span>Total filtered: <b style={{ color: '#111c28' }}>{fmtMoney(filtered.reduce((s, r) => s + r.amount, 0))}</b></span>
        </div>
      </div>
    </main>
  );
}

function KpiCard({ label, value, accent, sub }: { label: string; value: string | number; accent: string; sub?: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '18px 20px',
      flex: '1 1 0', minWidth: 160, borderTop: `3px solid ${accent}`,
    }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: '#111c28', lineHeight: 1, fontFamily: 'var(--font-mono, monospace)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}
