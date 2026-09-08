'use client';

// page.tsx is a Server Component, so `dynamic()` called there directly does
// NOT actually code-split — Next only defers a Client Component import when
// the dynamic() call itself lives inside a 'use client' module (per
// node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md). CalendarView
// pulls in its own month/week grid logic and is only ever rendered on the
// Calendar tab, so without this wrapper its JS still ships in the bundle for
// every client who opens straight into Reviews.
import dynamic from 'next/dynamic';

export const CalendarView = dynamic(
  () => import('./CalendarView').then(m => m.CalendarView),
  { loading: () => <div className="skel" style={{ minHeight: 420, borderRadius: 16 }} /> },
);
