import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

// One-time migration endpoint — protect with a secret token
export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const db = drizzle(sql);
    await migrate(db, { migrationsFolder: './drizzle' });
    return NextResponse.json({ ok: true, message: 'Migrations applied' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
