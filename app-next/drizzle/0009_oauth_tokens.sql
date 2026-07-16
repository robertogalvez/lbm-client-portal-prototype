CREATE TABLE IF NOT EXISTS "oauth_tokens" (
  "provider"          varchar(50) PRIMARY KEY NOT NULL,
  "access_token"      text,
  "refresh_token"     text,
  "expires_at"        timestamp,
  "refresh_issued_at" timestamp,
  "alerted_at"        timestamp,
  "updated_at"        timestamp DEFAULT now()
);
