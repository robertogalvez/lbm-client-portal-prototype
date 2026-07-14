import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

// Registry of available reports. Add a card here as new reports ship.
const REPORTS = [
  {
    href: '/reports/pipeline',
    icon: '▤',
    title: 'Content Pipeline',
    description:
      'Per-client footage supply and remaining pipeline — see who has enough content queued to meet their weekly / monthly commitment.',
  },
];

export default async function ReportsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  return (
    <main style={{ maxWidth: 1100 }}>
      <div className="db-topbar" style={{ padding: '15px 24px', borderBottom: '1px solid #e7ebef' }}>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em' }}>Reports</div>
        <div style={{ fontSize: 12.5, color: '#8b97a4', marginTop: 1 }}>
          Operational reports across the production pipeline
        </div>
      </div>

      <div
        style={{
          padding: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {REPORTS.map(r => (
          <Link
            key={r.href}
            href={r.href}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: '20px 20px 22px',
              background: '#fff',
              border: '1px solid #e7ebef',
              borderRadius: 12,
              textDecoration: 'none',
              boxShadow: '0 1px 2px rgba(17,28,40,.04)',
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(255,96,0,0.10)',
                color: '#FF6000',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
              }}
            >
              {r.icon}
            </div>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: '#111c28' }}>{r.title}</div>
            <div style={{ fontSize: 13, color: '#6c7787', lineHeight: 1.55 }}>{r.description}</div>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#FF6000', marginTop: 2 }}>Open report →</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
