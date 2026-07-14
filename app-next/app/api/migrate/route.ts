import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });

  const directUrl = dbUrl.replace('-pooler', '');
  const host = directUrl.replace(/:([^@]+)@/, ':***@').split('?')[0];

  try {
    const sql = neon(directUrl);

    // Run all DDL in a single pipeline call so they commit together
    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS "auth_user" (
        "id"             text PRIMARY KEY NOT NULL,
        "name"           text NOT NULL,
        "email"          text NOT NULL UNIQUE,
        "email_verified" boolean NOT NULL DEFAULT false,
        "image"          text,
        "created_at"     timestamp NOT NULL DEFAULT now(),
        "updated_at"     timestamp NOT NULL DEFAULT now(),
        "role"           varchar(30) NOT NULL DEFAULT 'account_manager'
      )`,
      sql`CREATE TABLE IF NOT EXISTS "auth_session" (
        "id"          text PRIMARY KEY NOT NULL,
        "expires_at"  timestamp NOT NULL,
        "token"       text NOT NULL UNIQUE,
        "created_at"  timestamp NOT NULL DEFAULT now(),
        "updated_at"  timestamp NOT NULL DEFAULT now(),
        "ip_address"  text,
        "user_agent"  text,
        "user_id"     text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE
      )`,
      sql`CREATE TABLE IF NOT EXISTS "auth_account" (
        "id"                       text PRIMARY KEY NOT NULL,
        "account_id"               text NOT NULL,
        "provider_id"              text NOT NULL,
        "user_id"                  text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE,
        "access_token"             text,
        "refresh_token"            text,
        "id_token"                 text,
        "access_token_expires_at"  timestamp,
        "refresh_token_expires_at" timestamp,
        "scope"                    text,
        "password"                 text,
        "created_at"               timestamp NOT NULL DEFAULT now(),
        "updated_at"               timestamp NOT NULL DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS "auth_verification" (
        "id"         text PRIMARY KEY NOT NULL,
        "identifier" text NOT NULL,
        "value"      text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS "clients" (
        "id"                 uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name"               varchar(255) NOT NULL,
        "clickup_option_id"  varchar(100) NOT NULL UNIQUE,
        "type"               varchar(20) NOT NULL,
        "show_calendar"      boolean DEFAULT false,
        "monthly_quota"      integer,
        "frameio_project_id" varchar(100),
        "whatsapp_number"    varchar(30),
        "branding_config"    jsonb,
        "created_at"         timestamp DEFAULT now()
      )`,
      sql`ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS am_name text`,
      sql`ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS client_name text`,
      sql`ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS is_also_client boolean DEFAULT false`,
      sql`ALTER TABLE auth_session ADD COLUMN IF NOT EXISTS remember_device boolean NOT NULL DEFAULT false`,
      sql`CREATE TABLE IF NOT EXISTS "video_cache" (
        "clickup_task_id"     varchar(50) PRIMARY KEY NOT NULL,
        "client_id"           varchar(100),
        "editor_id"           varchar(100),
        "assigned_am_id"      varchar(100),
        "title"               text,
        "status"              varchar(100),
        "client_approval"     varchar(50),
        "video_level"         varchar(50),
        "caption"             text,
        "publishing_status"   varchar(50),
        "frameio_asset_id"    varchar(100),
        "vistasocial_post_id" varchar(100),
        "last_synced_at"      timestamp DEFAULT now(),
        "dirty"               boolean DEFAULT false
      )`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS assigned_am_name text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS editor_name text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS client_name text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS quality_check varchar(50)`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS date_updated text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS due_date text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS caption_approval varchar(50)`,
      sql`ALTER TABLE video_cache ALTER COLUMN frameio_asset_id TYPE text`,
      sql`DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'clickup_option_id')
             AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'clients' AND column_name = 'clickup_task_id') THEN
            ALTER TABLE clients RENAME COLUMN clickup_option_id TO clickup_task_id;
          END IF;
        END $$`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_name text`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS contact_email text`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_status varchar(20)`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_synced_at timestamp`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS show_invoices boolean DEFAULT false`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS show_report boolean DEFAULT false`,
      sql`ALTER TABLE clients ALTER COLUMN type DROP NOT NULL`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS is_youtube boolean DEFAULT false`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS raw_drive_link text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS instagram_url text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS vistasocial_scheduled_at timestamp`,
    ]);

    const rows = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;
    const tables = rows.map((r: any) => r.table_name);

    return NextResponse.json({ ok: true, host, tables });
  } catch (e) {
    return NextResponse.json({ error: String(e), host }, { status: 500 });
  }
}
