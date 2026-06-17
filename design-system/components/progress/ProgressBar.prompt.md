Completion bar for project tasks and monthly packages — brand green, flips to the darker "done" green at 100%.

```jsx
<ProgressBar value={92} label="Tasks completed" right="11 / 12 · 92%" />
<ProgressBar value={100} label="Tasks completed" right="14 / 14 · 100%" />
```

The right-hand value uses tabular mono so stacked bars align. Set `warm` on client/mobile cards.
