import type { ReactNode } from 'react';
import { T } from '@/components/ui/tokens';

interface PageHeaderProps {
  /** A string, or a breadcrumb — the client detail page passes a link plus a name. */
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

/** Shared page header: title + subtitle left, actions right. */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="db-page-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', padding: '26px 34px 0' }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.015em', color: T.ink, margin: 0 }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13.5, color: T.ink3, margin: '6px 0 0' }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 }}>{actions}</div>}
    </header>
  );
}
