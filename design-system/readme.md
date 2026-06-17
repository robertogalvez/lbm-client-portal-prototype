# LBM Portal — Design System

The design system for **Legacy Building Media (LBM)**, a web-design & digital-marketing agency (content, ads, funnels, CRM, branding) that also produces video content for clients. The LBM Portal is the **client-facing review & approval layer** that sits at the tail of LBM's internal ClickUp production pipeline: finished deliverables (videos) are submitted for client sign-off via embedded **Frame.io**, and the client's decision (approve / request changes) syncs back to the originating ClickUp task. Clients are notified by **WhatsApp or email** per their preference, and log in via **magic link**.

There are two distinct audiences, and the system serves each with its own surface treatment on a shared brand + semantic core:

| Audience | Surface | Treatment |
|---|---|---|
| **External clients** (10–20, on the go) | Mobile-first | Warm / consumer palette, soft large radii, big tap targets |
| **Internal team** (CEO + account managers) | Desktop | Cool / data-dense palette, navy sidebar, mono figures, dense tables & charts |

Clients come in two types the UI accounts for: **retainer** clients (monthly social-video packages — feed + publishing calendar) and **one-time** clients (a single promo/YouTube film — single-video project home with a progress tracker).

## Sources

This system was distilled from working mockups built in this project (the source of truth for every pattern here):

- `/LBM Portal Mockups v3.html` — client mobile (review feed, publishing calendar, video review, one-time home) + admin desktop (review queue, video detail with sync & activity).
- `/LBM Ops Dashboard.html` — admin editing-operations & editor-marketplace analytics dashboard.
- `/LBM Portal Mockups v2.html`, `/LBM Portal Mockups.html` — earlier desktop-only iterations (historical).

Methodology influence: the *UI UX Pro Max* reasoning pass (B2B Service + Analytics Dashboard → Minimalism / Trust & Authority, flat surfaces, tabular figures) informed the v2→v3 system.

---

## CONTENT FUNDAMENTALS

**Voice.** Plain, warm, and operational — never salesy or jargon-heavy. The portal talks like a competent producer keeping a client in the loop.

- **Person.** Address the client as **"you"** ("Needs your review", "We'll WhatsApp you the moment it's ready"). Refer to the team in third person by name ("Sofia M.").
- **Casing.** Sentence case everywhere except short uppercase **eyebrows/labels** ("JUNE SOCIAL PACKAGE", table headers). Never title-case headings.
- **Tone.** Action-first and reassuring. Buttons are verbs: *Watch & review*, *Approve*, *Request changes*, *Notify client via WhatsApp*. Status reads as plain state: *Awaiting your review*, *Changes*, *Approved*.
- **Numbers carry meaning.** Copy pairs a figure with a "so-what" ("WhatsApp 4.2h vs email 11.6h", "78 piling up unassigned → you need ~2 more editors"). Deltas always compare ("+6 pts vs last 30d").
- **Emoji.** Rare and only in human-authored content (a client/AM comment may include one, e.g. "🙌"). Never in UI chrome, labels, or headings.
- **Domain language.** Videos, not "assets/deliverables". Tasks/cards map to ClickUp. "First-pass approval", "turnaround", "revisions", "cycle time" on the ops side.

---

## VISUAL FOUNDATIONS

**Two palettes, one brand.** Brand orange `#FF6000` (flowing to red in the logo gradient) is the constant — CTAs, active nav, progress fill, focus rings, accents — across both surfaces. It pops deliberately against cool neutrals and the navy sidebar. Everything else forks:

- **Admin (cool):** near-navy ink `#111c28` on cool greys (`--page #eceef1`, `--hover #f5f7f9`), deep-navy sidebar `#101a26`. Reads as a precise operational tool.
- **Client (warm):** warm off-white `--m-bg #faf6f0`, warm ink `#221e18`, terracotta accent `#c2703c`. Reads as a calm consumer app.

**Semantic color is law.** Status is *always* the same mapping — blue = In Progress, amber = In Review / Awaiting, green = **Approved / Done / success only**, red = Changes requested, slate = To Do, violet = internal QC. Each is a text color + a soft tint background (client surfaces use a warmer tint set). Green is reserved for success so it never competes with the orange brand; amber is held to a gold/brown so it stays distinct from orange. Never introduce a new status color.

**Typography.** Two families: **Plus Jakarta Sans** for all UI (weights 400–800; headings 700–800 with negative tracking), **IBM Plex Mono** for *every* number, date, ID, timecode, and metric — always `font-variant-numeric: tabular-nums` so columns and stacked bars align. Body 14px desktop / 15px mobile; nothing below 11px.

**Spacing & layout.** 4px base scale. Admin = 230px sidebar + 1280px content max. Client = 392px device, 44px minimum tap target. Generous padding; flex/grid with `gap`, never margin hacks.

**Corners.** Admin is crisp (cards 12px, buttons 8px, badges 6px). Client is soft (cards 22px, buttons 13px, tiles 16px, phone screen 44px).

**Elevation — flat & modern.** No gradients on chrome (gradients appear only as video-thumbnail placeholders and media scrims). Shadows are soft, low, and sparse: hairline `--line` borders do most of the work; outer frames get `--shadow-frame` (0 10px 34px / .07); cards lift to `--shadow-card` on hover only.

**Borders.** 1px everywhere. `--line` for dividers/table rows, `--line-strong` for emphasis (outline buttons, frame edges). Status-select chips on admin add a 1px tinted border matching their tone.

**Backgrounds.** Solid fills only. Video tiles use a dark diagonal gradient placeholder (real thumbnails replace these). No textures, no patterns, no full-bleed photography in chrome.

**Motion.** Quick and functional. `--t-fast 130ms` for hover/press/color, `--t-base 200ms` for card lift and bar fills, on one easing `cubic-bezier(.2,.7,.3,1)`. Buttons press-scale to 0.97. Progress/scatter bars animate width on mount. **Everything is gated behind `prefers-reduced-motion`.** No infinite/decorative loops.

**Hover & press.** Hover = subtle bg shift to `--hover` (rows, ghost buttons) or a darker brand (`--brand-dark` on primary) + a card lift. Press = 0.97 scale. Focus = 2.5px brand outline, 2px offset (accessibility-first; visible on keyboard nav).

**Cards.** White (or warm-white) surface, 1px `--line` border, rounded per surface, no border by default beyond the hairline; hover adds border-strong + soft shadow + (client) a 2px translateY lift.

**Orange on light — use the text-safe shade.** `#FF6000` on white is bold-text-only (~3:1). For orange *text* on light surfaces (links, eyebrows) use `--brand-darker #B23E00` (~5.9:1). White-on-orange is reserved for filled buttons and active nav (bold). The orange→red `--brand-gradient` is for brand moments only — the logo lockup, login, an occasional hero — never on dense chrome (calm-professional vibe).

**Data visualization.** All charts are hand-built inline SVG in brand + semantic tokens — sparklines, horizontal bars, a quadrant scatter (quality vs speed), donut, and an area trend with a dashed target line. Gridlines use `--line`; ticks/labels in mono. No charting library.

---

## ICONOGRAPHY

- **Style:** [Lucide](https://lucide.dev)-style line icons — 2px stroke, round caps/joins, `currentColor`, drawn inline as SVG at 15–22px. This is the single icon language across the system.
- **No icon font, no PNG icons, no emoji in chrome.** Emoji appears only inside human-authored comment text.
- **Brand/integration glyphs** are drawn inline where needed: the **WhatsApp** mark (filled), and small lettermark tiles for **ClickUp** (`CU`, `#7B68EE`) and **Frame.io** (`F`, `#5b6bff`). Platform tags (Instagram / TikTok / YouTube / LinkedIn) use simple inline marks on video tiles.
- **Logo:** the official **Legacy Media** wordmark (italic, bold, condensed, orange→red gradient on transparent) lives at `assets/legacy-media-logo.png` — use it in the sidebar, headers, login, and email. It works on light and dark surfaces. Keep clear space ≥ its cap-height; never recolor or place it on a clashing background. A compact **LBM** monogram (white, weight-800, brand-orange rounded square) is the small-space / favicon fallback.
- When you need an icon not yet used, pull the matching Lucide glyph (same 2px line style) rather than mixing in a filled or differently-weighted set.

---

## Index / Manifest

**Root**
- `styles.css` — global entry point (link this). `@import`s all tokens.
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `motion.css`, `fonts.css`.
- `readme.md` — this guide. `SKILL.md` — Claude Code skill manifest.

**Components** (`components/`) — React primitives (`.jsx` + `.d.ts` + `.prompt.md` + card):
- `buttons/Button` — primary / outline / ghost / danger / whatsapp; sm·md·lg; icons; disabled.
- `badges/StatusBadge` — semantic status pill, cool + warm.
- `avatar/Avatar` — initials avatar, 6-color palette, 3 sizes.
- `metric/MetricCard` — dashboard KPI card with value, delta, sparkline slot.
- `progress/ProgressBar` — task/package completion bar.

**UI kits** (`ui_kits/`)
- `client-mobile/` — review feed + video review (warm, mobile).
- `admin-desktop/` — editing-operations dashboard (cool, desktop).

**Guidelines** (`guidelines/`) — foundation specimen cards (colors, type, spacing) for the Design System tab.

---

## Caveats

- **Official Legacy Media logo is included** (`assets/legacy-media-logo.png`); the in-screen monogram in the older v3 mockups is the small-space fallback. Source brand: [legacybuildingmedia.com](https://legacybuildingmedia.com).
- **White-on-orange contrast:** `#FF6000` fills meet AA only for **bold/large** text — keep button labels semibold+, and use `--brand-darker` for any orange text on light. (See Visual Foundations.)
- **Webfonts load from Google Fonts** (Plus Jakarta Sans, IBM Plex Mono). Self-host and swap `tokens/fonts.css` to `@font-face` for production/offline.
- **Icons reference the Lucide visual language** but are drawn inline per-use rather than imported as a set — wire up the Lucide package (or your own sprite) in production.
- **The v3 mockups & Ops dashboard still carry the original green** in their own inline `<style>` blocks — this round re-themed the **design-system tokens + specimen cards** only (per scope). Say the word and I'll repaint those screens orange too.
- **Dashboard figures are illustrative** agency data, not real metrics — they demonstrate the metric model.
