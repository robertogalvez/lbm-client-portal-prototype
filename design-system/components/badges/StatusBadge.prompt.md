Semantic status pill — the single source of truth for state color across the portal. Map status → tone consistently (never invent new colors).

```jsx
<StatusBadge tone="amber">Awaiting your review</StatusBadge>
<StatusBadge tone="green">Approved</StatusBadge>
<StatusBadge tone="red" warm>Changes</StatusBadge>
```

Tone legend: `blue`=In Progress, `amber`=In Review / Awaiting Approval, `green`=Approved / Done / Completed, `red`=Changes requested, `slate`=To Do, `violet`=Internal QC. Set `warm` on mobile/client surfaces for the softer tint and heavier weight. `dot={false}` drops the leading dot for tight rows.
