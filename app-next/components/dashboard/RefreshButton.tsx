'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useTransition } from 'react';

type State = 'idle' | 'syncing' | 'success' | 'error' | 'cooldown';

const COOLDOWN_MS = 2 * 60 * 1000;

export function RefreshButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [state, setState] = useState<State>('idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [lastSync, setLastSync] = useState(0);

  // On mount: check localStorage for existing cooldown
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('lbm_last_sync');
    const elapsed = stored ? Date.now() - Number(stored) : Infinity;
    if (elapsed < COOLDOWN_MS) {
      setState('cooldown');
      setLastSync(Number(stored));
    }
  }, []);

  // Interval to update "Xm ago" label and check cooldown expiry
  useEffect(() => {
    if (state !== 'cooldown') return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastSync;
      if (elapsed >= COOLDOWN_MS) {
        setState('idle');
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [state, lastSync]);

  const handleClick = useCallback(async () => {
    if (state !== 'idle') return;
    setState('syncing');

    try {
      const res = await fetch('/api/sync-now', { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        setState('error');
        setTimeout(() => setState('idle'), 5_000);
        return;
      }

      setSyncedCount(data.synced ?? 0);
      const now = Date.now();
      if (typeof window !== 'undefined') {
        localStorage.setItem('lbm_last_sync', now.toString());
      }
      setLastSync(now);
      setState('success');

      startTransition(() => {
        router.refresh();
      });

      setTimeout(() => setState('cooldown'), 5_000);
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 5_000);
    }
  }, [state, router, startTransition]);

  const minsAgo = lastSync ? Math.floor((Date.now() - lastSync) / 60_000) : 0;
  const agoLabel = minsAgo < 1 ? 'just now' : `${minsAgo}m ago`;

  const isDisabled = state === 'syncing' || state === 'cooldown';

  const color =
    state === 'success' ? '#14805f'
    : state === 'error' ? '#cf3f36'
    : '#54616f';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      title="Sync from ClickUp"
      style={{
        border: '1px solid #e7ebef',
        background: '#fff',
        borderRadius: 8,
        height: 34,
        padding: '0 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12.5,
        fontWeight: 600,
        color,
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        opacity: state === 'cooldown' ? 0.5 : 1,
        flexShrink: 0,
        transition: 'opacity 0.2s, color 0.2s',
      }}
    >
      {state === 'syncing' ? (
        /* Spinner */
        <svg
          viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ width: 14, height: 14, animation: 'lbm-spin 0.8s linear infinite' }}
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M8 16H3v5"/>
        </svg>
      ) : state === 'success' ? (
        /* Green checkmark */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ) : state === 'error' ? (
        /* Red X */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      ) : (
        /* Refresh icon (idle + cooldown) */
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          style={{ width: 14, height: 14 }}>
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
          <path d="M21 3v5h-5"/>
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
          <path d="M8 16H3v5"/>
        </svg>
      )}

      {state === 'idle' && 'Sync'}
      {state === 'syncing' && 'Syncing…'}
      {state === 'success' && `Synced ${syncedCount} tasks`}
      {state === 'error' && 'Sync failed'}
      {state === 'cooldown' && `Synced ${agoLabel}`}

      <style>{`
        @keyframes lbm-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </button>
  );
}
