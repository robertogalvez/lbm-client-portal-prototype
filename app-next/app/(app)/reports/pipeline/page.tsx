import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getActiveTasks } from '@/lib/reports/data';
import { buildPipelineReport } from '@/lib/reports/pipeline';
import { PipelineReport } from '@/components/reports/PipelineReport';

export const dynamic = 'force-dynamic';

export default async function PipelineReportPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect('/login');

  const [caller] = await db.select({ role: authUsers.role }).from(authUsers).where(eq(authUsers.id, session.user.id)).limit(1);
  if (!caller || caller.role === 'client') redirect('/client');

  const tasks = await getActiveTasks();
  const pipelineReport = buildPipelineReport(tasks);
  const asOf = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <main style={{ maxWidth: 1100 }}>
      <div className="db-topbar" style={{ padding: '15px 24px', borderBottom: '1px solid #e7ebef' }}>
        <Link href="/reports" style={{ fontSize: 12.5, fontWeight: 600, color: '#8b97a4', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          ← Reports
        </Link>
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 4 }}>Content Pipeline</div>
        <div style={{ fontSize: 12.5, color: '#8b97a4', marginTop: 1 }}>
          Footage supply and remaining pipeline by client
        </div>
      </div>

      <div style={{ padding: '22px 24px 44px' }}>
        <PipelineReport clients={pipelineReport} asOf={asOf} />
      </div>
    </main>
  );
}
