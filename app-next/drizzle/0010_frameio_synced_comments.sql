CREATE TABLE IF NOT EXISTS "frameio_synced_comments" (
  "frameio_comment_id" varchar(100) PRIMARY KEY NOT NULL,
  "clickup_task_id"    varchar(50) NOT NULL,
  "synced_at"          timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "frameio_synced_comments_task_idx"
  ON "frameio_synced_comments" ("clickup_task_id");
