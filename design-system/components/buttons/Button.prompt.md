Brand button for the LBM Portal — flat fill with a quick 130ms press-scale; use `primary` for the main action on a view, never two on one row.

```jsx
<Button variant="primary" size="lg" full>Approve</Button>
<Button variant="danger">Request changes</Button>
<Button variant="outline">View details</Button>
<Button variant="whatsapp" iconLeft={<WhatsAppIcon/>}>Notify client</Button>
```

Variants: `primary` (brand-green CTA), `outline` (secondary), `ghost` (toolbar / low-emphasis), `danger` (request changes — red tint), `whatsapp` (notify). Sizes: `sm`, `md`, `lg` (lg for mobile, meets 44px tap target). Disabled state auto-greys and blocks the press animation. Pass `full` to stretch in a button row.
