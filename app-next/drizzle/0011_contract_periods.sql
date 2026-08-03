ALTER TABLE video_cache ADD COLUMN IF NOT EXISTS deliverable_type varchar(20) NOT NULL DEFAULT 'short_form';
UPDATE video_cache SET deliverable_type = 'youtube' WHERE is_youtube = true AND deliverable_type = 'short_form';

CREATE TABLE IF NOT EXISTS "contract_periods" (
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
);
CREATE INDEX IF NOT EXISTS "contract_periods_client_idx" ON "contract_periods" ("client_id");

CREATE TABLE IF NOT EXISTS "contract_months" (
  "id"              uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "period_id"       uuid NOT NULL REFERENCES "contract_periods"("id") ON DELETE CASCADE,
  "month"           varchar(7) NOT NULL,
  "active"          boolean NOT NULL DEFAULT true,
  "quota_override"  integer,
  "scope_note"      varchar(160),
  "amended"         boolean NOT NULL DEFAULT false,
  "note"            text,
  UNIQUE ("period_id", "month")
);
