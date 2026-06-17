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
});

export const authSessions = pgTable('auth_session', {
  id:          text('id').primaryKey(),
  expiresAt:   timestamp('expires_at').notNull(),
  token:       text('token').notNull().unique(),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
  ipAddress:   text('ip_address'),
  userAgent:   text('user_agent'),
  userId:      text('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
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
  clickupOptionId:   varchar('clickup_option_id', { length: 100 }).unique().notNull(),
  type:              varchar('type', { length: 20 }).notNull(),
  showCalendar:      boolean('show_calendar').default(false),
  monthlyQuota:      integer('monthly_quota'),
  frameioProjectId:  varchar('frameio_project_id', { length: 100 }),
  whatsappNumber:    varchar('whatsapp_number', { length: 30 }),
  brandingConfig:    jsonb('branding_config'),
  createdAt:         timestamp('created_at').defaultNow(),
});

export const videoCache = pgTable('video_cache', {
  clickupTaskId:     varchar('clickup_task_id', { length: 50 }).primaryKey(),
  clientId:          varchar('client_id', { length: 100 }),
  editorId:          varchar('editor_id', { length: 100 }),
  assignedAmId:      varchar('assigned_am_id', { length: 100 }),
  title:             text('title'),
  status:            varchar('status', { length: 100 }),
  clientApproval:    varchar('client_approval', { length: 50 }),
  videoLevel:        varchar('video_level', { length: 50 }),
  caption:           text('caption'),
  publishingStatus:  varchar('publishing_status', { length: 50 }),
  frameioAssetId:    varchar('frameio_asset_id', { length: 100 }),
  vistasocialPostId: varchar('vistasocial_post_id', { length: 100 }),
  lastSyncedAt:      timestamp('last_synced_at').defaultNow(),
  dirty:             boolean('dirty').default(false),
});

export type AuthUser    = typeof authUsers.$inferSelect;
export type Client      = typeof clients.$inferSelect;
export type VideoCache  = typeof videoCache.$inferSelect;
