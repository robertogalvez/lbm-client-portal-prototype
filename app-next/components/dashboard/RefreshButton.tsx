'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spinning, setSpinning] = useState(false);

  function handleClick() {
    setSpinning(true);
    startTransition(() => {
      router.refresh();
    });
    setTimeout(() => setSpinning(false), 800);
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      title="Refresh data"
      style={{
        width: 34, height: 34, borderRadius: 8,
        border: '1px solid #e7ebef',
        background: '#fff',
        display: 'grid', placeItems: 'center',
        cursor: pending ? 'not-allowed' : 'pointer',
        color: '#54616f',
        flexShrink: 0,
      }}
    >
      <svg
        viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={{
          width: 16, height: 16,
          transition: 'transform 0.6s ease',
          transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)',
        }}
      >
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
        <path d="M21 3v5h-5"/>
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
        <path d="M8 16H3v5"/>
      </svg>
    </button>
  );
}
