'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export function InfoPopover({ tip }: { tip: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!rect) return;
    function close() { setRect(null); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [rect]);

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setRect(prev => prev ? null : btnRef.current!.getBoundingClientRect());
  }

  return (
    <>
      <button
        ref={btnRef}
        className="db-info-btn"
        onClick={handleOpen}
        aria-label="More information"
        aria-expanded={!!rect}
      >?</button>
      {rect && typeof document !== 'undefined' && createPortal(
        <span
          className="db-info-bubble"
          role="tooltip"
          style={{
            position: 'fixed',
            bottom: window.innerHeight - rect.top + 7,
            left: rect.left + rect.width / 2,
            transform: 'translateX(-50%)',
          }}
        >{tip}</span>,
        document.body
      )}
    </>
  );
}
