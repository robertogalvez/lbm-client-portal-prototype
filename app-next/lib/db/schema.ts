import { pgTable, varchar, text, timestamp, boolean, uuid, integer, jsonb } from 'drizzle-orm/pg-core';

// ── BetterAuth tables ────────────────────────────────────────────────────────

export const authUsers = pgTable('auth_user', {
  id:            text('id').primaryKey(),
  name:          text('name').notNull(),
  email:         text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image:         text('image'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
  updatedAt:     timestamp('updated_at').notNull().defaultNow(),
  role:          varchar('role', { length: 30 }).notNull().default('account_manager'),
  amName:        text('am_name'),
  clientName:    text('client_name'),
  isAlsoClient:  boolean('is_also_client').default(false),
});

export const authSessions = pgTable('auth_session', {
  id:             text('id').primaryKey(),
  expiresAt:      timestamp('expires_at').notNull(),
  token:          text('token').notNull().unique(),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
  updatedAt:      timestamp('updated_at').notNull().defaultNow(),
  ipAddress:      text('ip_address'),
  userAgent:      text('user_agent'),
  userId:         text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  rememberDevice: boolean('remember_device').notNull().default(false),
});

export const authAccounts = pgTable('auth_account', {
  id:                     text('id').primaryKey(),
  accountId:              text('account_id').notNull(),
  providerId:             text('provider_id').notNull(),
  userId:                 text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  accessToken:            text('access_token'),
  refreshToken:           text('refresh_token'),
  idToken:                text('id_token'),
  accessTokenExpiresAt:   timestamp('access_token_expires_at'),
  refreshTokenExpiresAt:  timestamp('refresh_token_expires_at'),
  scope:                  text('scope'),
  password:               text('password'),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
});

export const authVerifications = pgTable('auth_verification', {
  id:         text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value:      text('value').notNull(),
  expiresAt:  timestamp('expires_at').notNull(),
  createdAt:  timestamp('created_at').defaultNow(),
  updatedAt:  timestamp('updated_at').defaultNow(),
});

// ── LBM tables ───────────────────────────────────────────────────────────────

export const clients = pgTable('clients', {
  id:                uuid('id').defaultRandom().primaryKey(),
  name:              varchar('name', { length: 255 }).notNull(),
  clickupTaskId:     varchar('clickup_task_id', { length: 100 }).unique().notNull(),
  type:              varchar('type', { length: 20 }),
  showCalendar:      boolean('show_calendar').default(false),
  showInvoices:      boolean('show_invoices').default(false),
  showReport:        boolean('show_report').default(false),
  monthlyQuota:      integer('monthly_quota'),
  frameioProjectId:  varchar('frameio_project_id', { length: 100 }),
  whatsappNumber:    varchar('whatsapp_number', { length: 30 }),
  brandingConfig:    jsonb('branding_config'),
  contactName:       text('contact_name'),
  contactEmail:      text('contact_email'),
  clientStatus:      varchar('client_status', { length: 20 }),
  lastSyncedAt:      timestamp('last_synced_at'),
  createdAt:         timestamp('created_at').defaultNow(),
});

export const videoCache = pgTable('video_cache', {
  clickupTaskId:     varchar('clickup_task_id', { length: 50 }).primaryKey(),
  clientId:          varchar('client_id', { length: 100 }),
  editorId:          varchar('editor_id', { length: 100 }),
  assignedAmId:      varchar('assigned_am_id', { length: 100 }),
  title:             text('title'),
  clientFacingTitle: text('client_facing_title'),
  status:            varchar('status', { length: 100 }),
  clientApproval:    varchar('client_approval', { length: 50 }),
  videoLevel:        varchar('video_level', { length: 50 }),
  caption:           text('caption'),
  publishingStatus:  varchar('publishing_status', { length: 50 }),
  frameioAssetId:    text('frameio_asset_id'),
  rawDriveLink:      text('raw_drive_link'),
  vistasocialPostId: varchar('vistasocial_post_id', { length: 100 }),
  vistasocialScheduledAt: timestamp('vistasocial_scheduled_at'),
  instagramUrl:      text('instagram_url'),
  assignedAmName:    text('assigned_am_name'),
  editorName:        text('editor_name'),
  clientName:        text('client_name'),
  qualityCheck:      varchar('quality_check', { length: 50 }),
  captionApproval:   varchar('caption_approval', { length: 50 }),
  revisions:         integer('revisions'),
  isYoutube:         boolean('is_youtube').default(false),
  dateUpdated:       text('date_updated'),
  dueDate:           text('due_date'),
  lastSyncedAt:      timestamp('last_synced_at').defaultNow(),
  dirty:             boolean('dirty').default(false),
});

// Frame.io comments already mirrored into ClickUp (idempotency ledger for the
// comment sync — a Frame.io comment id lands in ClickUp exactly once).
export const frameioSyncedComments = pgTable('frameio_synced_comments', {
  frameioCommentId: varchar('frameio_comment_id', { length: 100 }).primaryKey(),
  clickupTaskId:    varchar('clickup_task_id', { length: 50 }).notNull(),
  syncedAt:         timestamp('synced_at').defaultNow(),
});

// OAuth token store (currently: Frame.io v4 OAuth 2.0 refresh/access tokens).
export const oauthTokens = pgTable('oauth_tokens', {
  provider:        varchar('provider', { length: 50 }).primaryKey(),
  accessToken:     text('access_token'),
  refreshToken:    text('refresh_token'),
  expiresAt:       timestamp('expires_at'),
  refreshIssuedAt: timestamp('refresh_issued_at'),
  alertedAt:       timestamp('alerted_at'),
  updatedAt:       timestamp('updated_at').defaultNow(),
});

export type AuthUser    = typeof authUsers.$inferSelect;
export type Client      = typeof clients.$inferSelect;
export type VideoCache  = typeof videoCache.$inferSelect;
export type OAuthToken  = typeof oauthTokens.$inferSelect;
