import Link from 'next/link';

export function Sidebar({ active, showClientPortal }: { active?: string; showClientPortal?: boolean }) {
  const NAV = [
    { label: 'Dashboard', href: '/dashboard', icon: '▦' },
    { label: 'Clients', href: '/admin/clients', icon: '◎' },
    { label: 'Invoices', href: '/invoices', icon: '▧' },
    { label: 'Reports', href: '/reports', icon: '▤' },
    { label: 'Publishing', href: '#', icon: '⬆', disabled: true },
    ...(showClientPortal ? [{ label: 'My Client Portal', href: '/client', icon: '▤' }] : []),
    { label: 'Settings', href: '/settings', icon: '⚙' },
  ];
  return (
    <aside className="db-sidebar" style={{
      width: 220, flexShrink: 0, background: '#101a26',
      display: 'flex', flexDirection: 'column',
      minHeight: '100vh', position: 'sticky', top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid #1a2735' }}>
        <span style={{
          fontWeight: 800, fontSize: 18, letterSpacing: '-0.02em',
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

      {/* Nav */}
      <nav style={{ padding: '12px 10px', flex: 1 }}>
        {NAV.map(item => {
          const isActive = active === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 7, marginBottom: 2,
                fontSize: 13.5, fontWeight: 500, textDecoration: 'none',
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
    </aside>
  );
}
