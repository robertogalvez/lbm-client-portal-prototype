# Client Mobile — UI Kit

The external **client** experience. Mobile-first, warm/consumer palette. Clients are real-estate / construction operators reviewing finished social videos on the go.

## Screens
- `index.html` — **Review feed** (retainer client) + **Video review** (Frame.io player + Approve / Request changes dock).

Other client screens defined in the full mockups (`/LBM Portal Mockups v3.html`): publishing calendar, one-time-client project home.

## Patterns
- Device: 392px phone, Dynamic-Island status bar, bottom tab bar (Reviews / Calendar / Account).
- Surfaces use warm tokens (`--m-bg`, `--m-surface`, `--m-ink`, `--warm-accent`).
- Cards are large-radius (`--radius-m-card` 22px); buttons `--radius-m-btn` 13px, min 44px tap target.
- Status badges use the `warm` tint variant.
- Video tiles always show a platform tag (Reel / TikTok / YouTube) + a "Frame.io" source tag + duration in mono.
- The approval dock is sticky at the bottom and states the ClickUp side-effect ("updates the ClickUp task automatically").
