import React from "react";

/**
 * Progress bar with optional label row. Turns green at 100%.
 */
export function ProgressBar({ value = 0, label, right, warm = false }) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = pct >= 100 ? "var(--green)" : "var(--brand)";
  const track = warm ? "#e8ecf0" : "var(--hover)";
  return (
    <div>
      {(label || right) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, marginBottom: 7 }}>
          {label && <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>{label}</span>}
          {right && <span style={{ fontWeight: 600, fontSize: 12, fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" }}>{right}</span>}
        </div>
      )}
      <div style={{ height: 7, background: track, borderRadius: 100, overflow: "hidden" }}>
        <div style={{ height: "100%", width: pct + "%", background: fill, borderRadius: 100, transition: "width var(--t-base) var(--ease)" }} />
      </div>
    </div>
  );
}
