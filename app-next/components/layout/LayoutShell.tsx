'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';

export function LayoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const noShell = pathname.startsWith('/client') || pathname.startsWith('/login');

  if (noShell) return <>{children}</>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#eceef1' }}>
      <Sidebar active={pathname} />
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}
