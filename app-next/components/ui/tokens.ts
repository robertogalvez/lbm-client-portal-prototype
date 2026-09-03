// The handoff's semantic palette, expressed in the app's own brand tokens
// (globals.css) rather than its proposed one — layout and semantics come from
// the design, colour stays the portal's. Import these instead of retyping
// hexes into another inline style object.

export const T = {
  brand:        '#FF6000',
  brandHover:   '#DB5200',
  brandDark:    '#B23E00',
  brandTint:    '#fff1e8',
  brandTint2:   '#ffdfcb',

  page:         '#eceef1',
  surface:      '#ffffff',
  surfaceSubtle:'#fbfcfd',
  hover:        '#f5f7f9',
  track:        '#f2f4f6',

  ink:          '#111c28',
  ink2:         '#54616f',
  ink3:         '#8b97a4',
  ghost:        '#b6bdc5',

  line:         '#e7ebef',
  lineStrong:   '#d4dbe2',
  divider:      '#ebeef1',
  dividerLight: '#f1f3f5',

  // Standalone status text (not chips)
  ok:           '#14805f',
  warn:         '#a86a00',
  danger:       '#cf3f36',
  info:         '#2563eb',
  destructive:  '#c0290c',
} as const;

// Attention surface — the Next-action banner and the coverage gap callout.
export const ATTENTION = {
  bg:     '#fff1e8',
  border: '#ffd0b3',
  head:   '#B23E00',
  body:   '#5A3325',
  chip:   '#ffdfcb',
} as const;

// Coverage stacked-bar segments. Same three colours everywhere coverage is
// drawn, so the Coverage tab and the client detail card read as one thing.
export const COVERAGE_COLORS = {
  delivered:  '#14805f',
  inPipeline: '#C58A1E',
  notStarted: '#d4dbe2',
  track:      '#eceef1',
} as const;

/** Zero renders as an em-dash, never as `0` — a rule from the handoff. */
export function dash(n: number | null | undefined): string {
  return n ? String(n) : '—';
}

export const MONO = 'var(--font-mono, "IBM Plex Mono", monospace)';
