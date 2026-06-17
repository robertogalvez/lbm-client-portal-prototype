import { pgTable, varchar, text, timestamp, boolean, uuid, integer, jsonb } from 'drizzle-orm/pg-core';

export const videoCache = pgTable('video_cache', {
  clickupTaskId:     varchar('clickup_task_id', { length: 50 }).primaryKey(),
  clientId:          varchar('client_id', { length: 100 }),       // clickup_option_id from Client Name (AM)
  editorId:          varchar('editor_id', { length: 100 }),
  assignedAmId:      varchar('assigned_am_id', { length: 100 }),
  title:             text('title'),
  status:            varchar('status', { length: 100 }),
  clientApproval:    varchar('client_approval', { length: 50 }),  // APPROVED | REQUESTED CHANGES | null
  videoLevel:        varchar('video_level', { length: 50 }),
  caption:           text('caption'),
  publishingStatus:  varchar('publishing_status', { length: 50 }),
  frameioAssetId:    varchar('frameio_asset_id', { length: 100 }),
  vistasocialPostId: varchar('vistasocial_post_id', { length: 100 }),
  lastSyncedAt:      timestamp('last_synced_at').defaultNow(),
  // Prevents cron from overwriting a pending local write
  dirty:             boolean('dirty').default(false),
});

export const clients = pgTable('clients', {
  id:                uuid('id').defaultRandom().primaryKey(),
  name:              varchar('name', { length: 255 }).notNull(),
  // UUID of the option in ClickUp "Client Name (AM)" dropdown — NEVER match by text
  clickupOptionId:   varchar('clickup_option_id', { length: 100 }).unique().notNull(),
  type:              varchar('type', { length: 20 }).notNull(), // 'retainer' | 'one_time'
  showCalendar:      boolean('show_calendar').default(false),
  monthlyQuota:      integer('monthly_quota'),
  frameioProjectId:  varchar('frameio_project_id', { length: 100 }),
  whatsappNumber:    varchar('whatsapp_number', { length: 30 }),
  brandingConfig:    jsonb('branding_config'),
  createdAt:         timestamp('created_at').defaultNow(),
});

export const users = pgTable('users', {
  id:        uuid('id').defaultRandom().primaryKey(),
  email:     varchar('email', { length: 255 }).unique().notNull(),
  role:      varchar('role', { length: 30 }).notNull(), // 'admin' | 'account_manager' | 'client'
  name:      varchar('name', { length: 255 }),
  createdAt: timestamp('created_at').defaultNow(),
});

export type VideoCache = typeof videoCache.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type User = typeof users.$inferSelect;
