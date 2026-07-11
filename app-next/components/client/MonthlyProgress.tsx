'use client';

import { useState } from 'react';
import { parseClickUpDate } from '@/lib/dates';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface ProgressTask {
  dateUpdated: string;
  isYoutube: boolean;
  status: string;
}

export function MonthlyProgress({ tasks, reelsAgreed, ytAgreed, reviewCount, inProductionCount }: {
  tasks: ProgressTask[];
  reelsAgreed: number;
  ytAgreed: number;
  reviewCount: number;
  inProductionCount: number;
}) {
  const [monthOffset, setMonthOffset] = useState(0);

  const now = new Date();
  const selected = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1).getTime();
  const monthEnd = new Date(selected.getFullYear(), selected.getMonth() + 1, 1).getTime();
  const monthLabel = selected.toLocaleString('default', { month: 'long' }).toUpperCase();

  const postedThisMonth = tasks.filter(t => {
    if (norm(t.status) !== 'posted in socials') return false;
    const d = parseClickUpDate(t.dateUpdated);
    return d >= monthStart && d < monthEnd;
  });
  const reelsPosted = postedThisMonth.filter(t => !t.isYoutube).length;
  const ytPosted = postedThisMonth.filter(t => t.isYoutube).length;
  const totalPosted = reelsPosted + ytPosted;
  const totalAgreed = reelsAgreed + ytAgreed;
  const pct = totalAgreed > 0 ? Math.min(100, Math.round((totalPosted / totalAgreed) * 100)) : 0;

  return (
    <div style={{ background: '#1a1714', borderRadius: 16, padding: '24px 32px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 32, color: '#fff' }}>
      {/* Conic progress ring */}
      <div style={{ position: 'relative', width: 72, height: 72, flexShrink: 0 }}>
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r="30" fill="none" stroke="#333" strokeWidth="8" />
          <circle cx="36" cy="36" r="30" fill="none" stroke="#f97316" strokeWidth="8"
            strokeDasharray={`${pct * 1.885} 188.5`} strokeLinecap="round"
            transform="rotate(-90 36 36)" />
        </svg>
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{totalPosted}/{totalAgreed}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <button
            onClick={() => setMonthOffset(o => o - 1)}
            style={{ width: 20, height: 20, borderRadius: 6, border: '1px solid #444', background: 'transparent', color: '#aaa', display: 'grid', placeItems: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><path d="m15 18-6-6 6-6" /></svg>
          </button>
          <div style={{ fontSize: 11, letterSpacing: 2, color: '#888', fontWeight: 600 }}>{monthLabel} CONTENT PACKAGE</div>
          <button
            onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
            disabled={monthOffset === 0}
            style={{ width: 20, height: 20, borderRadius: 6, border: '1px solid #444', background: 'transparent', color: monthOffset === 0 ? '#333' : '#aaa', display: 'grid', placeItems: 'center', cursor: monthOffset === 0 ? 'default' : 'pointer', flexShrink: 0 }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 11, height: 11 }}><path d="m9 18 6-6-6-6" /></svg>
          </button>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700 }}>{totalPosted} of {totalAgreed} videos this month</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12.5, color: '#bbb' }}>
          {reelsAgreed > 0 && <div>Reels: <strong style={{ color: '#fff' }}>{reelsPosted}/{reelsAgreed}</strong></div>}
          {ytAgreed > 0 && <div>YouTube: <strong style={{ color: '#fff' }}>{ytPosted}/{ytAgreed}</strong></div>}
        </div>
      </div>
      {/* Stat columns */}
      {[
        { label: 'Awaiting you', val: reviewCount, color: '#f59e0b' },
        { label: 'Published', val: totalPosted, color: '#22c55e' },
        { label: 'In production', val: inProductionCount, color: '#60a5fa' },
      ].map(s => (
        <div key={s.label} style={{ textAlign: 'center', minWidth: 80 }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.val}</div>
          <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  );
}
