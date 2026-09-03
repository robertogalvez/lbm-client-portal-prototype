import type { CSSProperties } from 'react';
import { T } from './tokens';

// Shared table chrome. Every admin table was carrying its own near-identical
// copy of these three objects, which is how the column headers ended up
// three different greys.

export const colHeader: CSSProperties = {
  fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: T.ink3,
};

export const headerRow = (grid: string): CSSProperties => ({
  display: 'grid', gridTemplateColumns: grid, gap: 16, alignItems: 'center',
  padding: '0 24px 10px', borderBottom: `1px solid ${T.divider}`,
});

export const bodyRow = (grid: string): CSSProperties => ({
  display: 'grid', gridTemplateColumns: grid, gap: 16, alignItems: 'center',
  padding: '15px 24px',
  textAlign: 'left', width: '100%', background: 'transparent',
  border: 'none', borderTop: `1px solid ${T.dividerLight}`,
  fontFamily: 'inherit', cursor: 'pointer', color: 'inherit',
});

export const emptyState: CSSProperties = {
  padding: '34px 24px', textAlign: 'center', fontSize: 13, color: T.ink3,
};

export const tableFooter: CSSProperties = {
  padding: '14px 24px 4px', fontSize: 12, color: T.ink3, borderTop: `1px solid ${T.dividerLight}`,
};
