import { NextResponse } from 'next/server';
import { runMigrations } from '@/lib/db/runMigrations.mjs';

export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });

  try {
    const { host, tables } = await runMigrations(dbUrl);
    return NextResponse.json({ ok: true, host, tables });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
