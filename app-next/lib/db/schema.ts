import { pgTable, varchar, text, timestamp, boolean, uuid, integer, jsonb, date } from 'drizzle-orm/pg-core';

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
  phone:         text('phone'),
  // How this AM is notified when a client approves/requests changes on one of
  // their videos, in addition to the ClickUp task comment — admin-configured
  // in Settings, not the AM's own choice. 'sms' requires `phone` to be set
  // AND Twilio to be configured (lib/sms.ts no-ops safely until it is).
  notifyMethod:  varchar('notify_method', { length: 10 }).notNull().default('none'),
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
  // Per-client notification preferences (admin-configured in the Clients
  // page, not synced from ClickUp) for the "your video is ready for review"
  // notice — independent toggles, not a single choice like the AM's
  // notifyMethod, since a client may reasonably want more than one channel.
  // notifyPush has no delivery mechanism yet (no push infra exists) — the
  // column exists so the Settings toggle can be wired end-to-end now and
  // just needs a "Coming soon" treatment in the UI.
  notifyEmail:       boolean('notify_email').notNull().default(true),
  notifySms:         boolean('notify_sms').notNull().default(false),
  notifyPush:        boolean('notify_push').notNull().default(false),
  // The portal account (auth_user.id) auto-provisioned from this client's
  // ClickUp "Contact Email Address" — ClickUp is the source of truth for who
  // the primary contact is, so re-syncing keeps THIS ONE account's email/name
  // matched to ClickUp going forward. Any additional accounts an admin
  // invites later (teammates) are untouched by sync — only the account this
  // column points at tracks ClickUp changes.
  primaryContactUserId: text('primary_contact_user_id'),
  // Admin-entered platform handles for the Asset inventory tab — keyed by
  // platform id ('instagram'|'facebook'|'tiktok'|'linkedin'|'youtube'|
  // 'website'), each an optional { handle, url } pair. Not ClickUp-owned;
  // AMs enter this directly, same as brandingConfig.
  socialLinks:       jsonb('social_links'),
  // 'YYYY-MM' of the last month this client was SMS'd that their monthly
  // report is ready — guards the scheduled reminder (see
  // app/api/reminders/new-report) to fire at most once per month per client.
  lastReportNotifiedMonth: varchar('last_report_notified_month', { length: 7 }),
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
  // Set the moment a task enters "for client review" (see
  // app/api/webhooks/clickup) — used to measure genuine client idle time for
  // the 24h AM reminder, independent of dateUpdated (which ClickUp bumps on
  // ANY field edit, not just the client's own action). reviewIdleRemindedAt
  // guards the reminder to fire at most once per review round; both reset
  // whenever the task re-enters "for client review" for a new round.
  reviewEnteredAt:       timestamp('review_entered_at'),
  reviewIdleRemindedAt:  timestamp('review_idle_reminded_at'),
  // 'short_form' | 'youtube' | 'ad' — replaces isYoutube, which can't express
  // an ad. Source of truth stays ClickUp (a "Deliverable Type" dropdown
  // mapped in the sync); isYoutube is kept for backward compatibility with
  // existing callers rather than dropped in the same change.
  deliverableType:   varchar('deliverable_type', { length: 20 }).notNull().default('short_form'),
});

// One row per signed contract. A renewal is a second row for the same
// client — this is what lets a client read as one client with two
// contracts rather than two clients.
export const contractPeriods = pgTable('contract_periods', {
  id:               uuid('id').defaultRandom().primaryKey(),
  clientId:         uuid('client_id').notNull().references(() => clients.id, { onDelete: 'cascade' }),
  label:            varchar('label', { length: 80 }).notNull(),
  startsOn:         date('starts_on').notNull(),
  endsOn:           date('ends_on'),
  model:            varchar('model', { length: 20 }).notNull(), // 'retainer' | 'package'
  cadencePerWeek:   integer('cadence_per_week'),
  monthlyQuota:     integer('monthly_quota'),
  contractedTotal:  integer('contracted_total').notNull(),
  // Authored, not derived — "renewed" vs "completed" is a commercial
  // judgement the dates alone can't express.
  state:            varchar('state', { length: 20 }).notNull(), // 'active'|'renewed'|'extended'|'paused'|'completed'
  carriedIn:        integer('carried_in').default(0),
  notes:            text('notes'),
  createdAt:        timestamp('created_at').defaultNow(),
});

// Deviation-only: a row exists only when a month departs from the
// standing agreement (contractPeriods.monthlyQuota). No row means the
// standard agreement ran that month.
export const contractMonths = pgTable('contract_months', {
  id:             uuid('id').defaultRandom().primaryKey(),
  periodId:       uuid('period_id').notNull().references(() => contractPeriods.id, { onDelete: 'cascade' }),
  month:          varchar('month', { length: 7 }).notNull(), // '2026-04'
  active:         boolean('active').notNull().default(true),
  quotaOverride:  integer('quota_override'),
  scopeNote:      varchar('scope_note', { length: 160 }),
  amended:        boolean('amended').notNull().default(false),
  note:           text('note'),
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

// Audit log of client approval decisions — ClickUp writes happen synchronously
// in the same request that inserts this row (see app/api/client/approve).
export const pendingDecisions = pgTable('pending_decisions', {
  id:           uuid('id').defaultRandom().primaryKey(),
  taskId:       varchar('task_id', { length: 100 }).notNull(),
  action:       varchar('action', { length: 30 }).notNull(), // 'approve'|'approve_with_fixes'|'changes'
  payload:      jsonb('payload').notNull(),                  // full request body for re-execution
  executeAfter: timestamp('execute_after').notNull(),
  userId:       text('user_id').notNull(),
  clientName:   varchar('client_name', { length: 255 }).notNull(),
  createdAt:    timestamp('created_at').defaultNow(),
  executed:     boolean('executed').notNull().default(false),
});

export type AuthUser        = typeof authUsers.$inferSelect;
export type Client          = typeof clients.$inferSelect;
export type VideoCache      = typeof videoCache.$inferSelect;
export type OAuthToken      = typeof oauthTokens.$inferSelect;
export type ContractPeriod  = typeof contractPeriods.$inferSelect;
export type ContractMonth   = typeof contractMonths.$inferSelect;
export type PendingDecision = typeof pendingDecisions.$inferSelect;
