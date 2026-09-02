# Handoff: LBM Portal — backend build

## Overview
The **LBM Portal** (Legacy Building Media) is the client-facing **review & approval layer** at the tail of LBM's internal **ClickUp** production pipeline. Finished videos are submitted for client sign-off via embedded **Frame.io**; the client approves or requests changes, and that decision flows back to the originating ClickUp task. Clients are notified by **WhatsApp or email** (their choice) and sign in with a **magic link** (no passwords).

Two audiences:
- **Clients** (external, ~10–20, mobile-first) — review videos, approve/reject, see a publishing calendar (retainer) or a single-project tracker (one-time).
- **Team** (internal, ~4–5: CEO + account managers, desktop) — review queue across all clients, per-video sync/activity, client management, and an ops/marketplace analytics dashboard.

This document is a **backend-oriented** spec: it describes the data model, auth, API surface, and integration flows the UI implies, plus design-derived considerations. It is intentionally pragmatic, not exhaustive — infer obvious CRUD from the entities.

## About the design files
The files in `screens/` are **design references created in HTML** — prototypes showing intended look and behavior, **not production code to copy**. The task is to **recreate these designs in the target environment** — **Next.js + Netlify** (per the project) using its established patterns — and build the backend that makes them real. If a component library isn't chosen yet, pick sensible defaults; the visual system is documented in the project's **Design System** (`/readme.md`, `/styles.css`, `/components`, `/tokens`).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, and interactions. Recreate pixel-faithfully using the design system tokens (brand orange `#FF6000`, Plus Jakarta Sans + IBM Plex Mono, flat surfaces). See the Design System project for the full token set and React primitives (`Button`, `StatusBadge`, `Avatar`, `MetricCard`, `ProgressBar`).

---

## Recommended stack
- **Framework:** Next.js (App Router) on **Netlify** (Netlify Functions / Route Handlers for the API + webhooks).
- **Auth:** **Better Auth** with the **magic-link** plugin (email) — see Auth below.
- **DB:** **Neon** (serverless Postgres). Use a connection-pooled client (Neon's serverless driver or `@neondatabase/serverless`) since Netlify Functions are stateless/short-lived.
- **Integrations:** ClickUp API + webhooks, Frame.io API + comment webhooks, a WhatsApp provider (Meta WhatsApp Cloud API or Twilio), and an email sender (Resend/SendGrid) for magic links + notifications.

---

## Screens (in `screens/`)
| File | Audience | Purpose |
|---|---|---|
| `Login — Magic Link.html` | Client (mobile) | Email entry → "link sent" (email + WhatsApp). Passwordless. |
| `Client + Admin Screens (v3).html` | Both | The core set: retainer review feed, publishing calendar, video review (Frame.io + approve/reject), one-time client home, admin review queue, admin video detail (sync + activity). |
| `Admin — Create Manage Client.html` | Admin (desktop) | Clients list + create/edit drawer. Shows the **ClickUp-checkbox → auto-provision → invite** flow, client type, package, notification preference, invite/resend. |
| `Ops Dashboard.html` | Admin (desktop) | Editing-operations & editor-marketplace analytics (metrics ClickUp can't compute). |

---

## Data model (entities derived from the UI)

```
User              — internal team OR client contact (Better Auth principal)
  id, email, name, role (admin | account_manager | client), avatar_initials,
  client_id (nullable; set for client users), created_at, last_login_at

Client            — an external company (Marlowe Homes, Ridgeline…)
  id, name, type (retainer | one_time), status (active | invited | not_invited | paused),
  contact_name, contact_email, contact_phone,
  notify_pref (whatsapp | email),
  show_calendar (bool), auto_notify (bool),
  clickup_list_id, account_manager_id (User), created_at, created_via (clickup | manual)

Package           — retainer monthly allotment (one per client per month)
  id, client_id, month (YYYY-MM), videos_committed (e.g. 8), videos_delivered

Video             — the unit of review (maps 1:1 to a ClickUp task)
  id, client_id, package_id (nullable for one-time), title,
  platform (instagram_reel | tiktok | youtube | youtube_short | linkedin | …),
  duration_seconds, account_manager_id,
  status (see state machine), version (v1, v2…),
  clickup_task_id, frameio_asset_id, frameio_review_url, thumbnail_url,
  submitted_at, decided_at, scheduled_publish_at, published_at, created_at

Comment           — review feedback (mirrored from Frame.io; shown in portal)
  id, video_id, author_user_id (nullable for external), author_label,
  source (frameio | portal), body, timecode_seconds (nullable),
  frameio_comment_id, created_at

Decision          — an approve / request-changes event (audit + triggers sync)
  id, video_id, user_id, type (approved | changes_requested),
  note, created_at

ActivityEvent     — client activity timeline (admin video detail)
  id, video_id (nullable), client_id, type
    (invite_sent | logged_in | viewed | watch_completed | commented | approved | changes_requested),
  channel (nullable: whatsapp | email | magic_link | frameio | portal),
  meta (jsonb: %watched, timecode, message_id…), created_at

Notification      — outbound message log (idempotency + delivery state)
  id, client_id, video_id (nullable), channel (whatsapp | email),
  template, provider_message_id, status (queued | sent | delivered | failed),
  created_at

Editor            — marketplace editor (Ops dashboard); freelance, paid per video
  id, name, tier (junior | mid | senior), specialty,
  rate_per_video, rating, active (bool)

EditorAssignment  — links an editor to a video they edited (powers all editor KPIs)
  id, editor_id, video_id, assigned_at, delivered_at,
  revisions_count, on_time (bool), cost
```

### Status state machine (`Video.status`)
ClickUp owns the **production** stages; the portal owns the **review** stages. Keep these in sync.
```
ready_to_edit → in_edit → internal_qc → in_review ⇄ changes_requested → approved → scheduled → published
                                            │
              (client requests changes) ────┘  (re-enters edit, version++)
```
- Portal is read/act only from **`in_review`** onward. Earlier stages display as status but aren't actionable by clients.
- `in_review` = "Awaiting your review" (amber). `approved` = green. `changes_requested` = red.
- A `changes_requested` decision bumps `version` and (via ClickUp) sends the task back to an edit status.

---

## Auth (Better Auth + magic link)
- **Passwordless magic link** for everyone. Client enters email → Better Auth issues a single-use, short-TTL token → link delivered by email **and** (for clients who prefer it) WhatsApp.
- **Roles:** `admin`, `account_manager`, `client`. Gate `/admin/*` routes to staff; clients only see their own `client_id` data (enforce row-level scoping in every query — a client must never read another client's videos).
- **Invite = first magic link.** "Send invite" / "Resend invite" on the admin client screen issues a magic link to the client contact and logs an `invite_sent` ActivityEvent.
- Sessions: short-lived JWT/session cookie; clients are typically on mobile and return via fresh links, so keep link TTL generous-but-safe (e.g. 15–30 min) and allow a logged-in session to persist.

---

## Key API surface (illustrative)
```
POST /api/auth/magic-link            → request link (email; fan-out to WhatsApp if pref)
GET  /api/auth/callback              → consume token, create session

# Client
GET  /api/me/videos?status=in_review → client's review feed
GET  /api/videos/:id                 → video + comments + frameio_review_url
POST /api/videos/:id/decision        → { type: approved|changes_requested, note }
GET  /api/me/calendar?month=YYYY-MM  → publishing calendar (retainer)

# Admin
GET  /api/admin/review-queue?type=&am=        → all videos awaiting review
GET  /api/admin/videos/:id                    → detail incl. sync state + activity
POST /api/admin/clients                       → create client (manual)
PATCH/api/admin/clients/:id                   → edit (type, pref, toggles…)
POST /api/admin/clients/:id/invite            → (re)send magic-link invite
POST /api/admin/videos/:id/notify             → trigger WhatsApp/email "ready" alert
GET  /api/admin/insights?range=30d            → ops dashboard aggregates

# Webhooks (inbound)
POST /api/webhooks/clickup                    → task status / checkbox / field changes
POST /api/webhooks/frameio                    → comment.created, asset.ready, etc.
POST /api/webhooks/whatsapp                   → delivery receipts (+ inbound replies)
```

---

## Integration flows

### 1) ClickUp → Portal (provisioning + pipeline sync)
- **Client auto-provision:** a custom checkbox/field on a ClickUp list ("Create portal account") fires a webhook → create/lookup `Client` (`created_via=clickup`, store `clickup_list_id`) → issue magic-link invite → log `invite_sent`. Surfaced in the admin "How clients are created" ribbon.
- **Video sync:** when a ClickUp task reaches the "submit for client review" status, upsert a `Video` (store `clickup_task_id`), set `status=in_review`, attach the Frame.io link, and notify the client.
- **Status mirror:** ClickUp status changes update `Video.status` and vice-versa (see below). Map ClickUp statuses ↔ portal statuses in one config module.

### 2) Portal → ClickUp (decisions)
- On `POST /decision`: write a `Decision`, then call the ClickUp API to move the task — `approved` → an "Approved/Schedule" status; `changes_requested` → back to an edit status with the client's note posted as a task comment. Log the matching `ActivityEvent`.

### 3) Frame.io ⇄ Portal ⇄ ClickUp (comments)
- The portal **embeds the Frame.io player** and shows comments. Frame.io is the system of record for frame-accurate feedback.
- Subscribe to Frame.io **comment webhooks**: on `comment.created`, upsert a `Comment` (`source=frameio`, store `frameio_comment_id`, `timecode_seconds`) and **mirror it onto the ClickUp task** as a comment. This is the "synced both ways" behavior shown on the admin video detail.
- *(Confirm the LBM Frame.io plan tier includes API + webhook access before committing to the embed + sync.)*

### 4) Notifications (WhatsApp / email)
- Respect `Client.notify_pref`. "New video ready" and the magic-link invite go out on the preferred channel (email always available as fallback).
- WhatsApp via Meta Cloud API requires **pre-approved message templates**; build a small template registry. Log every send as a `Notification` and update status from provider delivery webhooks.

---

## Design-derived considerations (important)
1. **Webhook idempotency.** ClickUp/Frame.io/WhatsApp may deliver duplicates. Dedupe on external IDs (`clickup_task_id`, `frameio_comment_id`, `provider_message_id`); make all sync handlers upserts.
2. **Sync-loop guard.** Portal→ClickUp and ClickUp→Portal both write status. Tag the origin of each change (or debounce) so a mirrored update doesn't echo back and ping-pong.
3. **Row-level client scoping.** Every client-facing query must filter by the session's `client_id`. This is the main security surface — clients share one app.
4. **Watch tracking drives a real metric.** The ops dashboard shows "watched in full before deciding (87%)". Capture playback progress (`viewed` / `watch_completed` ActivityEvents with `%watched`) from the Frame.io player or your own events — it's not free, plan for it.
5. **Ops metrics are computed, not stored in ClickUp.** First-pass approval %, edit→approval cycle time, revision reasons, editor turnaround/utilization, cost per finished minute, response-time-by-channel — all derive from `Decision`, `ActivityEvent`, `EditorAssignment`, and `Notification` timestamps. Design the schema so these are queryable aggregates (consider a nightly rollup table for the dashboard).
6. **Revision reasons.** "Why clients request changes" (pacing/music/color…) implies tagging change-requests by reason — add an optional `reason` enum on `Decision` (type=changes_requested) or derive from Frame.io comment tags.
7. **Magic-link invite states.** Client `status` (`not_invited → invited → active`) maps to the badges in the admin clients list; transition on invite-sent and first login.
8. **Retainer vs one-time branching.** `Client.type` switches the client home (feed + calendar vs single-project tracker) and whether a `Package` exists. The publishing calendar visibility is also per-client (`show_calendar`).
9. **Timezones.** Publishing calendar + "submitted 2h ago" need consistent TZ handling; store UTC, render in the viewer's locale.

---

## Design tokens (quick reference — full set in the Design System project)
- **Brand:** `#FF6000` (orange; primary/CTA/active). Hover `#DB5200`. Orange text on light `#B23E00`. Logo gradient `linear-gradient(100deg,#FF6000,#FF3D14,#F5232B)` (sparingly).
- **Status (fixed):** In Progress `#2563eb` · In Review/Awaiting `#a86a00` · **Approved/success `#14805f`** · Changes `#cf3f36` · To Do `#54616f` · QC `#7c66c4`.
- **Admin neutrals:** ink `#111c28`, muted `#8b97a4`, line `#e7ebef`, page `#eceef1`, sidebar `#101a26`.
- **Client warm:** bg `#faf6f0`, ink `#221e18`, line `#ece4d8`, accent = brand orange.
- **Integrations:** ClickUp `#7B68EE` · Frame.io `#5b6bff` · WhatsApp `#1FA855`.
- **Type:** Plus Jakarta Sans (UI), IBM Plex Mono + tabular-nums (all figures/dates/IDs).
- **Radii:** admin 12px cards / 8px buttons; client 22px cards / 13px buttons. **Motion:** 130/200ms, `cubic-bezier(.2,.7,.3,1)`, gated behind `prefers-reduced-motion`. Min mobile tap target 44px.

## Suggested env vars
```
DATABASE_URL=                # Neon
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
EMAIL_API_KEY=               # Resend/SendGrid (magic links + notifications)
CLICKUP_API_TOKEN=
CLICKUP_WEBHOOK_SECRET=
FRAMEIO_API_TOKEN=
FRAMEIO_WEBHOOK_SECRET=
TWILIO_ACCOUNT_SID=           # SMS notifications (lib/sms.ts)
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

## Assets
- Logo: `assets/legacy-media-logo.png` in the Design System project (orange→red wordmark, transparent). Use in sidebar, headers, login, emails. `LBM` monogram is the small-space fallback.
- Icons: Lucide-style 2px line icons, drawn inline in the mockups — use the Lucide package in the real app.

## Files
- `screens/Login — Magic Link.html`
- `screens/Client + Admin Screens (v3).html`
- `screens/Admin — Create Manage Client.html`
- `screens/Ops Dashboard.html`
- Design System (separate, in project root): `readme.md`, `SKILL.md`, `styles.css`, `tokens/`, `components/`, `ui_kits/`, `guidelines/`.

> Numbers in the mockups are illustrative dummy data, not real metrics.
