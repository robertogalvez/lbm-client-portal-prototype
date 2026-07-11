import { runMigrations } from '../lib/db/runMigrations.mjs';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.log('DATABASE_URL not set, skipping migrations.');
  process.exit(0);
}

try {
  const { host, tables } = await runMigrations(dbUrl);
  console.log(`Migrations applied to ${host}. Tables: ${tables.join(', ')}`);
} catch (e) {
  console.error('Migration failed:', e);
  process.exit(1);
}
