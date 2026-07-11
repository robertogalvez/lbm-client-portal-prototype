// Shared "View on Instagram" link for the published post URL. Rendered on the
// client video page, the client "Recently posted" list, the admin dashboard, and
// the AM page so a captured Instagram permalink surfaces consistently everywhere.
import type { CSSProperties } from 'react';

const IG_PINK = '#c13584';

export function InstagramLink({
  url,
  label = 'View on Instagram',
  style,
  compact = false,
}: {
  url: string;
  label?: string;
  style?: CSSProperties;
  compact?: boolean;
}) {
  const size = compact ? 12 : 13;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: compact ? 11 : 12,
        fontWeight: 600,
        color: IG_PINK,
        textDecoration: 'none',
        ...style,
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
      </svg>
      {label}
    </a>
  );
}
