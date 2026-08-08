'use client';

import { useEffect, useState, type ReactNode } from 'react';

// Mounts `children` only when the given media query currently matches —
// not just CSS-hidden, actually unmounted. Used to keep exactly one instance
// of a component (e.g. the comment composer) in the tree even though it
// needs to render in a different DOM slot per breakpoint; two CSS-toggled
// copies would both mount, doubling textareas/focus targets/autofocus races.
//
// Renders nothing until the first client-side check (avoids a hydration
// mismatch, since the server can't know the viewport) — a one-frame gap
// with neither slot mounted, which is the accepted cost of never having two.
export function MediaGate({ query, children }: { query: string; children: ReactNode }) {
  const [matches, setMatches] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  if (!matches) return null;
  return <>{children}</>;
}
