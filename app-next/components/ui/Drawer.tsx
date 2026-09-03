'use client';

import { useEffect, type ReactNode } from 'react';
import { T } from './tokens';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Sticky footer — one save for the whole panel, never per-section buttons. */
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
}

/**
 * Right-hand drawer. Was hand-rolled twice (ClientsPageClient and
 * ClientDetail) with two different escape-key behaviours.
 */
export function Drawer({ open, onClose, title, subtitle, footer, width = 560, children }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div
        onClick={onClose}
        style={{ position: 'absolute', inset: 0, background: 'rgba(17,28,40,0.42)' }}
        aria-hidden
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          position: 'relative', width, maxWidth: '92vw', height: '100%',
          background: T.surface, boxShadow: '-24px 0 60px rgba(17,28,40,0.18)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <header style={{
          position: 'sticky', top: 0, zIndex: 1, background: T.surface,
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '20px 24px 16px', borderBottom: `1px solid ${T.divider}`,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.ink }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 18, color: T.ink3, lineHeight: 1, padding: 2 }}
          >
            ✕
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px 24px' }}>{children}</div>

        {footer && (
          <footer style={{
            position: 'sticky', bottom: 0, background: T.surface,
            borderTop: `1px solid ${T.divider}`, padding: '16px 24px',
          }}>
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}
