'use client';

import { useState } from 'react';

// Reveals `items` a page at a time behind a "See more" button instead of
// rendering everything at once — items are pre-rendered server-side (RSC)
// and just handed to this client component to paginate through.
export function SeeMoreList({ items, pageSize = 20 }: { items: React.ReactNode[]; pageSize?: number }) {
  const [visible, setVisible] = useState(pageSize);
  const shown = items.slice(0, visible);
  const remaining = items.length - shown.length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {shown}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible(v => v + pageSize)}
          style={{
            marginTop: 4, padding: '11px 14px', borderRadius: 13,
            border: '1px solid #ece4d8', background: '#fff',
            color: '#6c6357', fontWeight: 700, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          See more ({remaining} more)
        </button>
      )}
    </div>
  );
}
