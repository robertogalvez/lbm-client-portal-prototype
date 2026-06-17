import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// One-time migration endpoint — protect with a secret token
export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = neon(process.env.DATABASE_URL!);

    // Run DDL statements individually
    const statements = [
      `CREATE TABLE IF NOT EXISTS "auth_user" (
        "id"             text PRIMARY KEY NOT NULL,
        "name"           text NOT NULL,
        "email"          text NOT NULL UNIQUE,
        "email_verified" boolean NOT NULL DEFAULT false,
        "image"          text,
        "created_at"     timestamp NOT NULL DEFAULT now(),
        "updated_at"     timestamp NOT NULL DEFAULT now(),
        "role"           varchar(30) NOT NULL DEFAULT 'account_manager'
      )`,
      `CREATE TABLE IF NOT EXISTS "auth_session" (
        "id"          text PRIMARY KEY NOT NULL,
        "expires_at"  timestamp NOT NULL,
        "token"       text NOT NULL UNIQUE,
        "created_at"  timestamp NOT NULL DEFAULT now(),
        "updated_at"  timestamp NOT NULL DEFAULT now(),
        "ip_address"  text,
        "user_agent"  text,
        "user_id"     text NOT NULL REFERENCES "auth_user"("id") ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS "auth_account" (
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
      `CREATE TABLE IF NOT EXISTS "auth_verification" (
        "id"         text PRIMARY KEY NOT NULL,
        "identifier" text NOT NULL,
        "value"      text NOT NULL,
        "expires_at" timestamp NOT NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS "clients" (
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
      `CREATE TABLE IF NOT EXISTS "video_cache" (
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
    ];

    const results: string[] = [];
    for (const stmt of statements) {
      await sql.unsafe(stmt);
      const tableName = stmt.match(/"(\w+)"/)?.[1] ?? 'unknown';
      results.push(`✓ ${tableName}`);
    }

    return NextResponse.json({ ok: true, tables: results });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
