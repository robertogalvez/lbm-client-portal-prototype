'use client';

// See CalendarView.lazy.tsx for why this wrapper exists — page.tsx is a
// Server Component, so dynamic() only splits the bundle when called from a
// 'use client' module. InvoicesView is only rendered on the Invoices tab.
import dynamic from 'next/dynamic';

export const InvoicesView = dynamic(
  () => import('./InvoicesView').then(m => m.InvoicesView),
  { loading: () => <div className="skel" style={{ minHeight: 240, borderRadius: 16 }} /> },
);
