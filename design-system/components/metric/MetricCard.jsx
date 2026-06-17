import React from "react";

/**
 * KPI / metric card for admin dashboards. Label with status dot, big
 * mono value, and an optional delta line. Lifts on hover.
 */
export function MetricCard({ label, dotColor = "var(--brand)", value, unit, delta = null, deltaTone = "up", children }) {
  const deltaColor = deltaTone === "warn" ? "var(--amber)" : "var(--green)";
  return (
    <div
      style={{
        border: "1px solid var(--line)", borderRadius: "var(--radius)",
        padding: "16px 17px", display: "flex", flexDirection: "column", gap: 10,
        background: "var(--surface)", transition: "var(--tr-lift)",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--line-strong)"; e.currentTarget.style.boxShadow = "var(--shadow-card)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ fontSize: 12.5, color: "var(--ink-2)", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flex: "none" }} />
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>
          {value}{unit && <span style={{ fontSize: 14, fontWeight: 500, color: "var(--ink-3)", marginLeft: 2, fontFamily: "var(--font-ui)" }}>{unit}</span>}
        </div>
        {children}
      </div>
      {delta && (
        <div style={{ fontSize: 12, fontWeight: 600, color: deltaColor, display: "inline-flex", alignItems: "center", gap: 5 }}>
          {delta}
        </div>
      )}
    </div>
  );
}
