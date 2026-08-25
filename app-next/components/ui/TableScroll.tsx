import type { ReactNode } from 'react';

/**
 * The admin tables are column-dense by design — five to seven columns of
 * numbers that only mean anything side by side. Below their natural width
 * they scroll inside the card instead of crushing every column to two
 * characters. Styles live in globals.css so the min-width can be a media
 * concern rather than an inline one.
 */
export function TableScroll({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className={`db-table-scroll${wide ? ' db-table-scroll-wide' : ''}`}>
      <div>{children}</div>
    </div>
  );
}
