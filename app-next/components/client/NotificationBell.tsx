'use client';

import { useState } from 'react';

interface ReviewTask {
  clickupTaskId: string;
  title: string;
  dateUpdated: string;
}

export function NotificationBell({ tasks }: { tasks: ReviewTask[] }) {
  const [open, setOpen] = useState(false);
  const count = tasks.length;

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
          {/* Backdrop */}
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200 }} />

          {/* Panel */}
          <div style={{
            position: 'absolute', top: 48, right: 0,
            width: 280, background: '#fff',
            border: '1px solid #ece4d8', borderRadius: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            zIndex: 201, overflow: 'hidden',
          }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #ece4d8', fontSize: 12, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Notifications
            </div>
            {count === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: '#9d9488' }}>
                No pending reviews
              </div>
            ) : (
              tasks.map(t => (
                <a key={t.clickupTaskId} href={`/client/videos/${t.clickupTaskId}`} onClick={() => setOpen(false)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '12px 16px', borderBottom: '1px solid #f7f2ea',
                  textDecoration: 'none', color: 'inherit',
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF6000', flexShrink: 0, marginTop: 4 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#221e18', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: '#9d9488', marginTop: 2 }}>Awaiting your review · {timeAgo(t.dateUpdated)}</div>
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
