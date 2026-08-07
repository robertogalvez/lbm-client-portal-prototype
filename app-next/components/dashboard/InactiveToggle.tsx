'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';

// Applies everywhere on the dashboard (pipeline analytics and clients alike),
// so this toggle lives in the global topbar rather than any one section.
export function InactiveToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const inactive = params.get('inactive') === '1';

  const toggle = useCallback((checked: boolean) => {
    const next = new URLSearchParams(params.toString());
    if (checked) next.set('inactive', '1');
    else next.delete('inactive');
    router.push(`${pathname}?${next.toString()}`);
  }, [params, pathname, router]);

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#54616f', userSelect: 'none' }}>
      <input
        type="checkbox"
        checked={inactive}
        onChange={e => toggle(e.target.checked)}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
      <div
        aria-hidden="true"
        style={{
          width: 36, height: 20, borderRadius: 10,
          background: inactive ? '#FF6000' : '#d4dbe2',
          position: 'relative', transition: 'background 0.2s',
          flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: inactive ? 18 : 2,
          width: 16, height: 16, borderRadius: '50%', background: '#fff',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
      Show inactive clients
    </label>
  );
}
