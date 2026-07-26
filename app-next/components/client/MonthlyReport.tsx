'use client';

import { useMemo, useState } from 'react';

// One published video, as it appears in the "Posted on socials" report.
export interface ReportVideo {
  clickupTaskId: string;
  title: string;
  datePosted: string | null;   // ms timestamp or ISO string — when it went to "Posted in socials"
  frameLink: string | null;
  instagramUrl: string | null;
}

// Report palette — mirrors the ClickUp "Posted on socials" export.
const NAVY = '#0d2540';
const BAND = '#d7dbe0';
const HEADER_BLUE = '#1b9de0';
const BORDER = '#dfe3e8';
const LINK = '#1a73c7';
const INK = '#2b3440';

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

// e.g. "2026-06" → sort key; label "June 2026"
function monthKey(v: string | null): string | null {
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null;
}
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function ReportLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ color: LINK, textDecoration: 'underline', wordBreak: 'break-all', fontSize: 12.5 }}
    >
      {href}
    </a>
  );
}

// Standalone HTML export that reproduces the report so the client can save / forward it.
function exportHtml(clientName: string, monthText: string, rows: ReportVideo[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const cell = (href: string | null) =>
    href ? `<a href="${esc(href)}">${esc(href)}</a>` : '<span class="na">N/A</span>';
  const body = rows.map((r, i) => `
    <tr>
      <td class="idx">${i + 1}</td>
      <td>${esc(fmtDate(r.datePosted))}</td>
      <td>${esc(r.title)}</td>
      <td>${cell(r.frameLink)}</td>
      <td>${cell(r.instagramUrl)}</td>
    </tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Posted on socials — ${esc(clientName)}</title>
    <style>
      body{font-family:Arial,Helvetica,sans-serif;margin:24px;color:${INK}}
      table{width:100%;border-collapse:collapse;table-layout:fixed}
      .bar{background:${NAVY};height:26px}
      .band{background:${BAND};text-align:center;padding:14px}
      .band h1{margin:0;font-size:22px;color:#2b3440}
      .band h2{margin:4px 0 0;font-size:16px;color:#5a6470}
      th{background:${HEADER_BLUE};color:#fff;font-size:14px;padding:12px 14px;text-align:left;border:1px solid ${HEADER_BLUE}}
      td{border:1px solid ${BORDER};padding:11px 14px;font-size:13px;vertical-align:top;word-break:break-word}
      td.idx{background:${BAND};text-align:center;font-weight:700;width:44px}
      a{color:${LINK}}
      .na{color:#9aa4b0}
      caption{caption-side:bottom;text-align:right;color:#9aa4b0;font-size:11px;padding-top:10px}
    </style></head><body>
    <div class="bar"></div>
    <div class="band"><h1>Video status</h1><h2>Posted in socials · ${esc(monthText)}</h2></div>
    <table>
      <thead><tr><th style="width:44px">#</th><th style="width:120px">Date</th><th>Video reference</th><th>Video</th><th>Instagram</th></tr></thead>
      <tbody>${body}</tbody>
      <caption>${esc(clientName)} — generated from Legacy Media portal</caption>
    </table>
    </body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `posted-on-socials-${clientName.replace(/\s+/g, '-')}-${monthText.replace(/\s+/g, '-')}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function MonthlyReport({ clientName, videos }: { clientName: string; videos: ReportVideo[] }) {
  // Months present in the data, newest first.
  const months = useMemo(() => {
    const set = new Set<string>();
    for (const v of videos) {
      const k = monthKey(v.datePosted);
      if (k) set.add(k);
    }
    return Array.from(set).sort().reverse();
  }, [videos]);

  const [month, setMonth] = useState<string>(() => months[0] ?? 'all');

  const rows = useMemo(() => {
    const list = month === 'all' ? videos.slice() : videos.filter(v => monthKey(v.datePosted) === month);
    // Newest posts at the top read best; the # column numbers them within the view.
    list.sort((a, b) => (toDate(b.datePosted)?.getTime() ?? 0) - (toDate(a.datePosted)?.getTime() ?? 0));
    return list;
  }, [videos, month]);

  const monthText = month === 'all' ? 'All time' : monthLabel(month);

  const th: React.CSSProperties = {
    background: HEADER_BLUE, color: '#fff', fontSize: 13, fontWeight: 700,
    padding: '12px 14px', textAlign: 'left', whiteSpace: 'nowrap',
    borderRight: '1px solid rgba(255,255,255,.25)',
  };
  const td: React.CSSProperties = {
    borderBottom: `1px solid ${BORDER}`, borderRight: `1px solid ${BORDER}`,
    padding: '11px 14px', fontSize: 13, color: INK, verticalAlign: 'top',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={month}
            onChange={e => setMonth(e.target.value)}
            style={{ fontSize: 13, fontWeight: 700, color: '#2b3440', background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 10, padding: '8px 12px', fontFamily: 'inherit' }}
          >
            {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            <option value="all">All time</option>
          </select>
          <span style={{ fontSize: 12.5, color: '#8b97a4', fontWeight: 600 }}>
            {rows.length} video{rows.length === 1 ? '' : 's'} posted
          </span>
        </div>
        {rows.length > 0 && (
          <button
            type="button"
            onClick={() => exportHtml(clientName, monthText, rows)}
            style={{ fontSize: 12.5, fontWeight: 700, borderRadius: 10, padding: '8px 12px', border: `1px solid ${BORDER}`, background: '#f7f1ea', color: '#221e18', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
            Export
          </button>
        )}
      </div>

      {/* Report card */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        {/* Navy top bar */}
        <div style={{ background: NAVY, height: 26 }} />
        {/* Title band */}
        <div style={{ background: BAND, textAlign: 'center', padding: '14px 12px' }}>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#2b3440', letterSpacing: '-0.01em' }}>Video status</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#5a6470', marginTop: 3 }}>
            Posted in socials{month !== 'all' ? ` · ${monthText}` : ''}
          </div>
        </div>

        {rows.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#9aa4b0', fontSize: 13.5 }}>
            No videos were posted in this period.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  <th style={{ ...th, width: 48, textAlign: 'center' }}>#</th>
                  <th style={{ ...th, width: 130 }}>Date</th>
                  <th style={{ ...th, width: 170 }}>Video reference</th>
                  <th style={th}>Video</th>
                  <th style={{ ...th, borderRight: 'none' }}>Instagram</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.clickupTaskId}>
                    <td style={{ ...td, background: BAND, textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(r.datePosted)}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.title}</td>
                    <td style={td}>{r.frameLink ? <ReportLink href={r.frameLink} /> : <span style={{ color: '#9aa4b0' }}>N/A</span>}</td>
                    <td style={{ ...td, borderRight: 'none' }}>{r.instagramUrl ? <ReportLink href={r.instagramUrl} /> : <span style={{ color: '#9aa4b0' }}>N/A</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
