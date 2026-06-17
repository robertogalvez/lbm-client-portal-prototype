# Admin Desktop — UI Kit

The internal **team** experience (CEO + account managers). Desktop, cool/data-dense palette, deep-navy sidebar rail.

## Screens
- `index.html` — **Editing operations & editor-marketplace dashboard**: KPI row, live pipeline WIP with bottleneck flag, revision-reason bars, editor quality-vs-speed scatter, client-response-by-channel, cycle-time trend, and the editor leaderboard table.

Other admin screens in the full mockups (`/LBM Portal Mockups v3.html`): review queue across all clients, per-video detail with ClickUp/Frame.io sync + client-activity timeline.

## Patterns
- Layout: 230px navy sidebar (`--sidebar`) + content max 1280px.
- Cards/blocks at `--radius` 12px, hairline `--line` borders, soft `--shadow-frame` on the outer frame only.
- All figures, dates, IDs, and timecodes render in IBM Plex Mono with tabular numerals.
- Charts are hand-built inline SVG using brand + semantic tokens (no chart library).
- A "source" chip on each analytics card names where the data is enriched from (ClickUp / Frame.io / Payouts / Portal-computed) — these are the metrics ClickUp itself can't compute.
- `seg` segmented control for time ranges; status uses the shared cool `StatusBadge` tones.
