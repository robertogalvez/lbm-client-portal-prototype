'use client';

// See CalendarView.lazy.tsx for why this wrapper exists — page.tsx is a
// Server Component, so dynamic() only splits the bundle when called from a
// 'use client' module. MonthlyReport is only rendered on the Report tab.
import dynamic from 'next/dynamic';

export const MonthlyReport = dynamic(
  () => import('./MonthlyReport').then(m => m.MonthlyReport),
  { loading: () => <div className="skel" style={{ minHeight: 320, borderRadius: 16 }} /> },
);
