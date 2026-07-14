'use client';

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
  return (
    <>
      {/* Stat columns - simplified informational display */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {stats.map(s => (
          <div key={s.label} style={{ textAlign: 'center', minWidth: 70 }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: s.color }}>{s.count}</div>
            <div style={{ fontSize: 12, color: '#aaa', marginTop: 2 }}>{s.label}</div>
            {(s.reelCount > 0 || s.youtubeCount > 0) && (
              <div style={{ fontSize: 11, color: '#999', marginTop: 4, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {s.reelCount > 0 && <span>Reels: {s.reelCount}</span>}
                {s.youtubeCount > 0 && <span>YT: {s.youtubeCount}</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
