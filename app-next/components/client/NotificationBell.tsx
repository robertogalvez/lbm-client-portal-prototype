'use client';

import { useState } from 'react';

interface ReviewTask {
  clickupTaskId: string;
  title: string;
  clientFacingTitle?: string | null;
  dateUpdated: string;
}

const STORAGE_KEY = 'lbm-dismissed-notifs';

function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

export function NotificationBell({ tasks }: { tasks: ReviewTask[] }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const visible = tasks.filter(t => !dismissed.has(t.clickupTaskId));
  const count = visible.length;

  function clearAll() {
    const next = new Set([...dismissed, ...tasks.map(t => t.clickupTaskId)]);
    setDismissed(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...next])); } catch { /* */ }
    setOpen(false);
  }

  function timeAgo(dateUpdated: string) {
    const ts = Number(dateUpdated);
    const ms = Date.now() - (isNaN(ts) ? new Date(dateUpdated).getTime() : ts);
    const d = Math.floor(ms / 86_400_000);
    if (d === 0) return 'Today';
    if (d === 1) return 'Yesterday';
    return `${d}d ago`;
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: 40, height: 40, borderRadius: 12,
          background: open ? '#FF6000' : '#fff',
          border: '1px solid #ece4d8',
          display: 'grid', placeItems: 'center',
          color: open ? '#fff' : '#6c6357',
          cursor: 'pointer', position: 'relative',
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{width:19,height:19}}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>
        </svg>
        {count > 0 && !open && (
          <span style={{
            position: 'absolute', top: -4, right: -4,
            minWidth: 17, height: 17,
            background: '#cf3f36', color: '#fff',
            fontSize: 10, fontWeight: 800,
            borderRadius: 100, display: 'grid', placeItems: 'center',
            padding: '0 4px', border: '2px solid #faf6f0',
          }}>{count}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />

          <div style={{
            position: 'absolute', top: 48, right: 0,
            width: 290, maxWidth: 'calc(100vw - 24px)', background: '#fff',
            border: '1px solid #ece4d8', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 201, overflow: 'hidden',
          }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #ece4d8', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notifications</span>
              {count > 0 && (
                <button type="button" onClick={clearAll} style={{ fontSize: 11.5, fontWeight: 700, color: '#B23E00', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                  Clear all
                </button>
              )}
            </div>

            {count === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#9d9488' }}>
                No pending reviews
              </div>
            ) : (
              visible.map(t => (
                <a key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}`} onClick={() => setOpen(false)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '11px 14px', borderBottom: '1px solid #f7f2ea',
                  textDecoration: 'none', color: 'inherit',
                }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FF6000', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#221e18', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.clientFacingTitle || t.title}</div>
                    <div style={{ fontSize: 11, color: '#9d9488', marginTop: 2 }}>Awaiting review · {timeAgo(t.dateUpdated)}</div>
                  </div>
                </a>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
