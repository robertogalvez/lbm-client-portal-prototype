'use client';

import { useMemo } from 'react';

// Per-client pipeline snapshot: how much raw footage is waiting to be edited
// (supply health) and what's left downstream toward publishing.
export interface PipelineReportClient {
  name: string;
  newFootage: number;      // Not Ready + Not Assigned + In Progress (Editor)
  corrections: number;     // In Progress (Corrections)
  qc: number;              // TC/QC (Somu) + QC Final – AM
  clientReview: number;    // For Client Review
  readyToPublish: number;  // Ready to be Posted
}

const GREEN = '#3f7a2f';
const BORDER = '#c9d2c2';
const INK = '#3a4a2e';

// Supply-health tiers, keyed off how much new footage is queued for editing.
// Thresholds reproduce the reference report; tune here if the business rule shifts.
function supplyStatus(n: number): { label: string; rowBg: string; text: string } {
  if (n === 0)  return { label: 'Delivered',          rowBg: '#d9d9d9', text: '#595959' };
  if (n === 1)  return { label: 'Nothing / Critical', rowBg: '#f4c7b8', text: '#a3311f' };
  if (n <= 9)   return { label: 'Low',                rowBg: '#ffe08a', text: '#8a6d00' };
  return          { label: 'Significant',        rowBg: '#c6e0b4', text: '#4a7a2a' };
}

// "6 in Client Review, 1 in QC" — biggest stages first, pipeline order breaks ties.
function pipelineBreakdown(c: PipelineReportClient): string {
  const parts: { label: string; count: number; order: number }[] = [
    { label: 'Corrections',   count: c.corrections,    order: 0 },
    { label: 'QC',            count: c.qc,             order: 1 },
    { label: 'Client Review', count: c.clientReview,   order: 2 },
    { label: 'Ready to Publish', count: c.readyToPublish, order: 3 },
  ].filter(p => p.count > 0);

  const total = parts.reduce((s, p) => s + p.count, 0);
  if (total === 0) {
    // Nothing anywhere → all shipped; footage upstream but empty downstream → idle pipeline.
    return c.newFootage === 0
      ? '0 (All content published, no pending items)'
      : '0 (No videos currently in progress)';
  }

  parts.sort((a, b) => b.count - a.count || a.order - b.order);
  const detail = parts.map(p => `${p.count} in ${p.label}`).join(', ');
  return `${total} (${detail})`;
}

export function PipelineReport({ clients, asOf }: { clients: PipelineReportClient[]; asOf: string }) {
  // Table 1 reads low-supply → high-supply so the at-risk clients sit up top.
  const bySupply = useMemo(
    () => clients.slice().sort((a, b) => a.newFootage - b.newFootage || a.name.localeCompare(b.name)),
    [clients],
  );
  // Table 2 lists everyone, biggest remaining pipeline first.
  const byPipeline = useMemo(
    () => clients.slice().sort((a, b) => {
      const ra = a.corrections + a.qc + a.clientReview + a.readyToPublish;
      const rb = b.corrections + b.qc + b.clientReview + b.readyToPublish;
      return rb - ra || a.name.localeCompare(b.name);
    }),
    [clients],
  );

  if (clients.length === 0) {
    return (
      <div style={{ padding: '48px 20px', textAlign: 'center', color: '#9aa4b0', fontSize: 14 }}>
        No client pipeline data available.
      </div>
    );
  }

  const th: React.CSSProperties = {
    background: GREEN, color: '#fff', fontSize: 13.5, fontWeight: 700,
    padding: '11px 16px', textAlign: 'left', whiteSpace: 'nowrap',
  };
  const td: React.CSSProperties = {
    borderBottom: `1px solid ${BORDER}`, padding: '10px 16px', fontSize: 13.5, color: INK,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
      {/* ── Table 1: New Content Available for Editing ── */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ background: GREEN, color: '#fff', textAlign: 'center', padding: '12px 16px', fontSize: 16, fontWeight: 800 }}>
          New Content Available for Editing ✅
        </div>
        <div style={{ textAlign: 'center', padding: '10px 16px', fontSize: 12.5, fontStyle: 'italic', color: '#7a857a', borderBottom: `1px solid ${BORDER}` }}>
          {asOf} · New = Not Ready + Not Assigned + In Progress (Editor)
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={th}>Client</th>
                <th style={{ ...th, textAlign: 'center' }}>New Footage Available for Editing</th>
                <th style={{ ...th, textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {bySupply.map(c => {
                const st = supplyStatus(c.newFootage);
                return (
                  <tr key={c.name} style={{ background: st.rowBg }}>
                    <td style={{ ...td, fontWeight: 700, color: st.text }}>{c.name}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: 15, color: st.text }}>{c.newFootage}</td>
                    <td style={{ ...td, textAlign: 'center', fontWeight: 700, color: st.text }}>{st.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Table 2: Remaining Pipeline ── */}
      <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden', background: '#fff' }}>
        <div style={{ padding: '12px 16px', fontSize: 14.5, fontWeight: 800, color: INK, borderBottom: `1px solid ${BORDER}` }}>
          Remaining Pipeline (Corrections, QC, Client Review &amp; Ready to Publish) — By Client
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ ...th, background: '#5a6b52' }}>Client</th>
                <th style={{ ...th, background: '#5a6b52' }}>Remaining Pipeline</th>
              </tr>
            </thead>
            <tbody>
              {byPipeline.map(c => (
                <tr key={c.name}>
                  <td style={{ ...td, fontWeight: 700 }}>{c.name}</td>
                  <td style={{ ...td, color: '#2f5aa8' }}>{pipelineBreakdown(c)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
