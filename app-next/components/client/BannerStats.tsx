'use client';

import { useState } from 'react';
import type { MappedTask } from '@/lib/clickup';

interface StatConfig {
  label: string;
  count: number;
  reelCount: number;
  youtubeCount: number;
  color: string;
  tasks: MappedTask[];
}

export function BannerStats({ stats }: { stats: StatConfig[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <>
      {/* Stat columns */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: 80, cursor: 'pointer' }} onClick={() => setExpanded(expanded === s.label ? null : s.label)}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{s.label}</div>
            {(s.reelCount > 0 || s.youtubeCount > 0) && (
              <div style={{ fontSize: 10, color: '#666', marginTop: 4, display: 'flex', gap: 4, justifyContent: 'center' }}>
                {s.reelCount > 0 && <span>📹 {s.reelCount}</span>}
                {s.youtubeCount > 0 && <span>▶ {s.youtubeCount}</span>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Expanded modal */}
      {expanded && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50
        }} onClick={() => setExpanded(null)}>
          <div style={{
            background: '#faf6f0', borderRadius: 16, padding: 24, maxWidth: 500, maxHeight: '80vh', overflow: 'auto',
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>
                {stats.find(s => s.label === expanded)?.label}
              </h3>
              <button onClick={() => setExpanded(null)} style={{
                background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: '#6b6455', padding: 0
              }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: '#6b6455' }}>📹 Reels: {stats.find(s => s.label === expanded)?.reelCount ?? 0}</span>
              <span style={{ fontSize: 12, color: '#6b6455' }}>▶ YouTube: {stats.find(s => s.label === expanded)?.youtubeCount ?? 0}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {stats.find(s => s.label === expanded)?.tasks.map(t => (
                <div key={t.clickupTaskId} style={{
                  padding: 12, background: '#fff', borderRadius: 8, border: '1px solid #ece4d8',
                  display: 'flex', alignItems: 'center', gap: 12, fontSize: 13
                }}>
                  <span style={{ fontSize: 16 }}>{t.isYoutube ? '▶' : '📹'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.clientFacingTitle || t.title}
                    </div>
                    <div style={{ fontSize: 11, color: '#9d9488' }}>{t.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
