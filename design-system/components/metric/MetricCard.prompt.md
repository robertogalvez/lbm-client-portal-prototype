KPI card for admin dashboards — label + status dot, oversized tabular-mono value, optional delta and sparkline. Four across in a grid is the standard dashboard top row.

```jsx
<MetricCard
  label="First-pass approval"
  value="73" unit="%"
  delta={<>▲ +6 pts <span style={{color:'var(--ink-3)'}}>vs last 30d</span></>}
>
  <svg className="spark" .../>
</MetricCard>
```

Values always render in IBM Plex Mono with tabular figures. Use `deltaTone="warn"` (amber) when the delta is a caution rather than a win. Pass a sparkline SVG as children to sit right of the value.
