CREATE TABLE IF NOT EXISTS "pending_decisions" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "task_id"       varchar(100) NOT NULL,
  "action"        varchar(30) NOT NULL,
  "payload"       jsonb NOT NULL,
  "execute_after" timestamp NOT NULL,
  "user_id"       text NOT NULL,
  "client_name"   varchar(255) NOT NULL,
  "created_at"    timestamp DEFAULT now(),
  "executed"      boolean NOT NULL DEFAULT false
);
