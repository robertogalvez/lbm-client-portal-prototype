---
name: lbm-portal-design
description: Use this skill to generate well-branded interfaces and assets for the LBM Portal (Legacy Building Media), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, fonts, components, and UI kits for the client review-and-approval portal (mobile client + desktop admin) built on top of ClickUp + Frame.io.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files (`styles.css` + `tokens/`, `components/`, `ui_kits/`, `guidelines/`).

Key facts to anchor on:
- **Two surfaces, one brand.** Brand orange `#FF6000` (Legacy Media, flowing to red in the logo gradient) is constant. External **clients** get a warm, mobile-first treatment; the internal **team** gets a cool, data-dense desktop treatment with a navy sidebar.
- **Semantic status colors are fixed** (blue=In Progress, amber=In Review/Awaiting, green=Approved/success only, red=Changes, slate=To Do, violet=QC) — never invent new ones. Orange is brand/primary, not a status.
- **Type:** Plus Jakarta Sans for UI, IBM Plex Mono with tabular figures for every number/date/ID.
- **Flat & modern:** hairline borders + sparse soft shadows, no chrome gradients, 130/200ms motion gated behind `prefers-reduced-motion`, Lucide-style 2px line icons.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view — link `styles.css` for tokens, and fork the screens in `ui_kits/` as starting points. If working on production code, copy the React components in `components/` and the token CSS, and apply the rules in `readme.md` to design as an expert in this brand.

If the user invokes this skill without other guidance, ask what they want to build, ask a few focused questions (which audience/surface? client vs admin? retainer vs one-time client?), then act as an expert designer who outputs HTML artifacts _or_ production code depending on the need.
