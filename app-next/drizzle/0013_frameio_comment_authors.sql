CREATE TABLE IF NOT EXISTS "frameio_comment_authors" (
  "frameio_comment_id" varchar(100) PRIMARY KEY NOT NULL,
  "author_name"        text NOT NULL,
  "created_at"         timestamp DEFAULT now()
);
