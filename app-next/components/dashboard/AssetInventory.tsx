'use client';

import { useState } from 'react';

export interface AssetInventoryRow {
  id: string;
  name: string;
  socialLinks: Record<string, { handle?: string; url?: string }> | null;
}

export const PLATFORMS = [
  { key: 'instagram', label: 'Instagram', color: '#E1306C' },
  { key: 'facebook', label: 'Facebook', color: '#1877F2' },
  { key: 'tiktok', label: 'TikTok', color: '#111c28' },
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2' },
  { key: 'youtube', label: 'YouTube', color: '#FF0000' },
  { key: 'website', label: 'Website', color: '#54616f' },
] as const;

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const th: React.CSSProperties = {
  textAlign: 'left', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em',
  textTransform: 'uppercase', color: '#8b97a4', padding: '11px 16px',
  background: '#f5f7f9', borderBottom: '1px solid #e7ebef', whiteSpace: 'nowrap',
};
const thSticky: React.CSSProperties = { ...th, position: 'sticky', left: 0, zIndex: 1 };
const td: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid #e7ebef', verticalAlign: 'middle' };
const tdSticky: React.CSSProperties = { ...td, position: 'sticky', left: 0, background: '#fff', zIndex: 1 };

export function AssetInventory({ rows }: { rows: AssetInventoryRow[] }) {
  const [search, setSearch] = useState('');
  const filtered = rows.filter(r => !search || r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search clients…"
        style={{ maxWidth: 340, padding: '9px 12px', borderRadius: 8, border: '1px solid #d4dbe2', fontSize: 13, fontFamily: 'inherit', outline: 'none' }}
      />

      <div style={{ border: '1px solid #e7ebef', borderRadius: 13, background: '#fff', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={thSticky}>Client</th>
                {PLATFORMS.map(p => <th key={p.key} style={th}>{p.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={PLATFORMS.length + 1} style={{ padding: '32px 16px', textAlign: 'center', color: '#8b97a4' }}>No clients match.</td></tr>
              )}
              {filtered.map(r => (
                <tr key={r.id}>
                  <td style={tdSticky}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: '#FF6000', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{initials(r.name)}</span>
                      <span style={{ fontWeight: 600 }}>{r.name}</span>
                    </div>
                  </td>
                  {PLATFORMS.map(p => {
                    const entry = r.socialLinks?.[p.key];
                    const handle = entry?.handle;
                    const url = entry?.url;
                    return (
                      <td key={p.key} style={td}>
                        {!handle && !url ? (
                          // Design's own documented fallback for a missing
                          // cell (§5.5) — not a placeholder invented here.
                          <span style={{ color: '#c3cbd3' }}>—</span>
                        ) : url ? (
                          <a href={url} target="_blank" rel="noreferrer" style={{ color: p.color, fontWeight: 600, textDecoration: 'none' }}>{handle || url}</a>
                        ) : (
                          <span style={{ color: p.color, fontWeight: 600 }}>{handle}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
