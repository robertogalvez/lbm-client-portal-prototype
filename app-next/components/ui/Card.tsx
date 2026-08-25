import type { CSSProperties, ReactNode } from 'react';
import { T } from './tokens';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Right-hand slot in the header: a segmented control, a search box, a legend. */
  action?: ReactNode;
  children?: ReactNode;
  /** Pass false when the body lays out its own full-bleed table rows. */
  padded?: boolean;
  style?: CSSProperties;
}

/**
 * The one card shell for the admin screens. Was a private helper inside
 * ClientDetail plus four near-identical inline copies elsewhere.
 */
export function Card({ title, subtitle, action, children, padded = true, style }: CardProps) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, borderRadius: 14, ...style }}>
      {(title || action) && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap',
          padding: '20px 24px 0',
        }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            {title && <div style={{ fontSize: 16, fontWeight: 600, color: T.ink, letterSpacing: '-0.01em' }}>{title}</div>}
            {subtitle && <div style={{ fontSize: 12.5, color: T.ink3, marginTop: 4, lineHeight: 1.45 }}>{subtitle}</div>}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      <div style={padded ? { padding: '16px 24px 22px' } : { paddingTop: 14 }}>{children}</div>
    </div>
  );
}
