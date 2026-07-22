'use client';

import { authClient } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function SidebarProfile({ user }: { user: { name: string; email: string } | null }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push('/login');
    } finally {
      setSigningOut(false);
    }
  }

  if (!user) return null;

  return (
    <div style={{ padding: '14px 16px', borderTop: '1px solid #1a2735', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: '#FF6000', color: '#fff', display: 'grid', placeItems: 'center',
          fontSize: 11, fontWeight: 700,
        }}>
          {initials(user.name)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e4e9ee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.name}
          </div>
          <div style={{ fontSize: 11, color: '#6b7888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.email}
          </div>
        </div>
      </div>
      <button
        onClick={handleSignOut}
        disabled={signingOut}
        style={{
          width: '100%', padding: '9px', borderRadius: 8,
          border: '1px solid #2a3846', background: 'transparent',
          color: '#aeb9c6', fontWeight: 600, fontSize: 12.5,
          cursor: signingOut ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
        </svg>
        {signingOut ? 'Closing session…' : 'Close session'}
      </button>
    </div>
  );
}
