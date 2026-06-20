import type { ReactNode } from 'react';

export function Tooltip({ children, tip }: { children: ReactNode; tip: string }) {
  return (
    <span className="db-tooltip-wrap">
      {children}
      <span className="db-tooltip-bubble" role="tooltip">{tip}</span>
    </span>
  );
}
