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
    // Measure outside the updater: React may invoke updaters more than once.
    setRect(rect ? null : btnRef.current!.getBoundingClientRect());
  }

  return (
    <>
      <button
        type="button"
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
            left: Math.min(
              Math.max(rect.left + rect.width / 2, 123),
              window.innerWidth - 123
            ),
            transform: 'translateX(-50%)',
          }}
        >{tip}</span>,
        document.body
      )}
    </>
  );
}
