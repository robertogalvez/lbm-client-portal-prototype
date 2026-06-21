'use client';

import { useState, useRef, useEffect } from 'react';

export function InfoPopover({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <span ref={ref} className="db-info-wrap">
      <button
        className="db-info-btn"
        onClick={() => setOpen(v => !v)}
        aria-label="More information"
      >?</button>
      {open && <span className="db-info-bubble" role="tooltip">{tip}</span>}
    </span>
  );
}
