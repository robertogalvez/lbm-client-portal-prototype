'use client';

import { useState } from 'react';

export function ViewAsBanner({ clientName }: { clientName: string }) {
  const [exiting, setExiting] = useState(false);

  async function exit() {
    setExiting(true);
    try {
      await fetch('/api/admin/view-as', { method: 'DELETE' });
    } finally {
      window.location.href = '/admin/clients';
    }
  }

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 200,
      background: '#111c28', color: '#fff',
      padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: 12, fontSize: 12.5, fontWeight: 600, flexWrap: 'wrap' as const,
      fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
    }}>
      <span>👁 Admin view — viewing <strong>{clientName}</strong>&apos;s portal exactly as they see it</span>
      <button
        type="button"
        onClick={exit}
        disabled={exiting}
        style={{
          background: '#FF6000', color: '#fff', border: 'none', borderRadius: 6,
          padding: '5px 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
          fontFamily: 'inherit', flexShrink: 0,
        }}
      >
        {exiting ? 'Exiting…' : 'Exit view'}
      </button>
    </div>
  );
}
