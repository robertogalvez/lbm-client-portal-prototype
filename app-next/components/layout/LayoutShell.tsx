'use client';

import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Sidebar } from './Sidebar';
import Link from 'next/link';

export function LayoutShell({ children, showClientPortal }: { children: React.ReactNode; showClientPortal?: boolean }) {
  const pathname = usePathname();
  const noShell = pathname.startsWith('/client') || pathname.startsWith('/login');
  const [open, setOpen] = useState(false);

  if (noShell) return <>{children}</>;

  const nav = [
    { label: 'Dashboard', href: '/dashboard', icon: '▦' },
    { label: 'Clients', href: '/admin/clients', icon: '◎' },
    { label: 'Publishing', href: '#', icon: '⬆', disabled: true },
    ...(showClientPortal ? [{ label: 'My Client Portal', href: '/client', icon: '▤' }] : []),
    { label: 'Settings', href: '/settings', icon: '⚙' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#eceef1' }}>
      <Sidebar active={pathname} showClientPortal={showClientPortal} />

      {/* Hamburger button — visible only when sidebar is hidden (≤860px) */}
      <button
        className="db-hamburger"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ width: 18, height: 18 }}>
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Drawer overlay */}
      {open && (
        <div className="db-drawer-overlay" onClick={() => setOpen(false)} />
      )}

      {/* Slide-in drawer */}
      {open && (
        <div className="db-drawer">
          {/* Logo */}
          <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid #1a2735', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <span style={{
                fontWeight: 800, fontSize: 17, letterSpacing: '-0.02em',
                background: 'linear-gradient(100deg, #FF6000 0%, #FF3D14 55%, #F5232B 100%)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Legacy Building Media
              </span>
              <div style={{ fontSize: 11, color: '#6b7888', marginTop: 2, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Portal
              </div>
            </div>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7888', padding: 4 }} aria-label="Close navigation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ width: 18, height: 18 }}>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Nav */}
          <nav style={{ padding: '12px 10px', flex: 1 }}>
            {nav.map(item => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => !item.disabled && setOpen(false)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '11px 10px', borderRadius: 7, marginBottom: 2,
                    fontSize: 14, fontWeight: 500, textDecoration: 'none',
                    color: item.disabled ? '#3d4f62' : isActive ? '#FF6000' : '#aeb9c6',
                    background: isActive ? 'rgba(255,96,0,0.12)' : 'transparent',
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    pointerEvents: item.disabled ? 'none' : 'auto',
                  }}
                >
                  <span style={{ fontSize: 15, width: 18, textAlign: 'center' }}>{item.icon}</span>
                  {item.label}
                  {item.disabled && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, color: '#3d4f62', background: '#1a2735', borderRadius: 4, padding: '2px 5px' }}>
                      Soon
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #1a2735', fontSize: 12, color: '#6b7888' }}>
            LBM Ops · v1
          </div>
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
