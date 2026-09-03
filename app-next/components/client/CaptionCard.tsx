'use client';

import { useState } from 'react';

const PLATFORM_LIMITS: Record<string, number> = {
  instagram: 2200,
  facebook: 63206,
  tiktok: 2200,
  linkedin: 3000,
  youtube: 5000,
};

export function CaptionCard({ caption, platform }: { caption: string; platform?: string }) {
  const [copied, setCopied] = useState(false);

  const limit = platform ? PLATFORM_LIMITS[platform.toLowerCase()] ?? null : null;
  const charCount = caption.length;
  const platformLabel = platform
    ? `${platform.charAt(0).toUpperCase()}${platform.slice(1)} Reel`
    : null;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked — ignore */ }
  }

  return (
    <div className="vd-caption-card">
      {platformLabel && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
            background: '#eaf0ff', color: '#2563eb',
          }}>{platformLabel}</span>
          {limit && (
            <span style={{ fontSize: 11, fontFamily: '"IBM Plex Mono", monospace', color: charCount > limit ? '#cf3f36' : '#9d9488' }}>
              {charCount.toLocaleString()} / {limit.toLocaleString()}
            </span>
          )}
        </div>
      )}

      <div style={{
        background: '#fff', border: '1px solid #ece4d8', borderRadius: 12,
        padding: '12px 14px', fontSize: 13.5, lineHeight: 1.62,
        color: '#221e18', whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
      }}>
        {caption}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button
          type="button"
          onClick={handleCopy}
          style={{
            minHeight: 44, padding: '10px 16px', borderRadius: 10,
            border: '1px solid #ece4d8', background: '#fff',
            fontSize: 13, fontWeight: 600, color: '#221e18',
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
            {copied
              ? <path d="M20 6 9 17l-5-5" />
              : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>
            }
          </svg>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <p style={{ fontSize: 11.5, color: '#9d9488', margin: '8px 0 0', lineHeight: 1.5 }}>
        We post this text exactly as written.
      </p>
    </div>
  );
}
