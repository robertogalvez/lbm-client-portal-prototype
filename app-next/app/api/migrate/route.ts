import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (!process.env.MIGRATE_SECRET || secret !== process.env.MIGRATE_SECRET) {
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
      sql`CREATE TABLE IF NOT EXISTS "oauth_tokens" (
        "provider"          varchar(50) PRIMARY KEY NOT NULL,
        "access_token"      text,
        "refresh_token"     text,
        "expires_at"        timestamp,
        "refresh_issued_at" timestamp,
        "alerted_at"        timestamp,
        "updated_at"        timestamp DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS "frameio_synced_comments" (
        "frameio_comment_id" varchar(100) PRIMARY KEY NOT NULL,
        "clickup_task_id"    varchar(50) NOT NULL,
        "synced_at"          timestamp DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS "frameio_synced_comments_task_idx" ON "frameio_synced_comments" ("clickup_task_id")`,
      sql`ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS phone text`,
      sql`ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS notify_method varchar(10) NOT NULL DEFAULT 'none'`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS notify_email boolean NOT NULL DEFAULT true`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS notify_sms boolean NOT NULL DEFAULT false`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS notify_push boolean NOT NULL DEFAULT false`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS review_entered_at timestamp`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS review_idle_reminded_at timestamp`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS primary_contact_user_id text`,
      sql`ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS deliverable_type varchar(20) NOT NULL DEFAULT 'short_form'`,
      sql`UPDATE video_cache SET deliverable_type = 'youtube' WHERE is_youtube = true AND deliverable_type = 'short_form'`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS social_links jsonb`,
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS last_report_notified_month varchar(7)`,
      sql`CREATE TABLE IF NOT EXISTS "video_priorities" (
        "clickup_task_id" varchar(50) PRIMARY KEY NOT NULL,
        "client_name"     varchar(255) NOT NULL,
        "rank"            integer NOT NULL,
        "updated_at"      timestamp DEFAULT now() NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS "frameio_comment_authors" (
        "frameio_comment_id" varchar(100) PRIMARY KEY NOT NULL,
        "author_name"        text NOT NULL,
        "created_at"         timestamp DEFAULT now()
      )`,
      sql`CREATE TABLE IF NOT EXISTS "contract_periods" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "client_id"         uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
        "label"             varchar(80) NOT NULL,
        "starts_on"         date NOT NULL,
        "ends_on"           date,
        "model"             varchar(20) NOT NULL,
        "cadence_per_week"  integer,
        "monthly_quota"     integer,
        "contracted_total"  integer NOT NULL,
        "state"             varchar(20) NOT NULL,
        "carried_in"        integer DEFAULT 0,
        "notes"             text,
        "created_at"        timestamp DEFAULT now()
      )`,
      sql`CREATE INDEX IF NOT EXISTS "contract_periods_client_idx" ON "contract_periods" ("client_id")`,
      sql`CREATE TABLE IF NOT EXISTS "contract_months" (
        "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "period_id"       uuid NOT NULL REFERENCES "contract_periods"("id") ON DELETE CASCADE,
        "month"           varchar(7) NOT NULL,
        "active"          boolean NOT NULL DEFAULT true,
        "quota_override"  integer,
        "scope_note"      varchar(160),
        "amended"         boolean NOT NULL DEFAULT false,
        "note"            text,
        UNIQUE ("period_id", "month")
      )`,
      sql`CREATE TABLE IF NOT EXISTS "pending_decisions" (
        "id"             uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "task_id"        varchar(100) NOT NULL,
        "action"         varchar(30) NOT NULL,
        "payload"        jsonb NOT NULL,
        "execute_after"  timestamp NOT NULL,
        "user_id"        text NOT NULL,
        "client_name"    varchar(255) NOT NULL,
        "created_at"     timestamp DEFAULT now(),
        "executed"       boolean NOT NULL DEFAULT false
      )`,
      // Contract redesign PR 1 — additive only, contractPeriods.clientId stays.
      sql`ALTER TABLE clients ADD COLUMN IF NOT EXISTS clickup_client_option_id varchar(100) UNIQUE`,
      sql`ALTER TABLE contract_periods ADD COLUMN IF NOT EXISTS renewed_from_period_id uuid UNIQUE REFERENCES "contract_periods"("id")`,
      sql`ALTER TABLE contract_periods ADD COLUMN IF NOT EXISTS data_quality_flag text`,
      sql`CREATE TABLE IF NOT EXISTS "contract_period_clients" (
        "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "period_id"   uuid NOT NULL REFERENCES "contract_periods"("id") ON DELETE CASCADE,
        "client_id"   uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
        "created_at"  timestamp DEFAULT now(),
        UNIQUE ("period_id", "client_id")
      )`,
      sql`CREATE INDEX IF NOT EXISTS "contract_period_clients_client_idx" ON "contract_period_clients" ("client_id")`,
      sql`CREATE TABLE IF NOT EXISTS "contract_line_items" (
        "id"                uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "period_id"         uuid NOT NULL REFERENCES "contract_periods"("id") ON DELETE CASCADE,
        "deliverable_type"  varchar(40) NOT NULL,
        "contracted_total"  integer NOT NULL,
        "monthly_quota"     integer,
        "carried_in"        integer DEFAULT 0,
        "created_at"        timestamp DEFAULT now(),
        UNIQUE ("period_id", "deliverable_type")
      )`,
      sql`ALTER TABLE contract_months ADD COLUMN IF NOT EXISTS line_item_id uuid REFERENCES "contract_line_items"("id") ON DELETE CASCADE`,
      // Old (period_id, month) uniqueness no longer fits now that a period
      // can have multiple deviation rows per month (one aggregate + one per
      // line item) — replaced by (period_id, line_item_id, month) below, plus
      // a partial index for the aggregate case since NULL never conflicts
      // with NULL in a plain unique constraint.
      sql`ALTER TABLE contract_months DROP CONSTRAINT IF EXISTS contract_months_period_id_month_key`,
      sql`DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'contract_months_period_id_line_item_id_month_unique'
          ) THEN
            ALTER TABLE contract_months
              ADD CONSTRAINT contract_months_period_id_line_item_id_month_unique
              UNIQUE ("period_id", "line_item_id", "month");
          END IF;
        END $$`,
      sql`CREATE UNIQUE INDEX IF NOT EXISTS "contract_months_aggregate_unique_idx"
        ON "contract_months" ("period_id", "month") WHERE "line_item_id" IS NULL`,
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
