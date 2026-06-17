import React from "react";

/**
 * Status pill used across the portal for video / task / project state.
 * Dot + label on a soft semantic tint. `tone` picks the color pair.
 */
export function StatusBadge({ children, tone = "slate", warm = false, dot = true, ...rest }) {
  const cool = {
    blue:   ["var(--blue)", "var(--blue-bg)"],
    amber:  ["var(--amber)", "var(--amber-bg)"],
    green:  ["var(--green)", "var(--green-bg)"],
    red:    ["var(--red)", "var(--red-bg)"],
    slate:  ["var(--slate)", "var(--slate-bg)"],
    violet: ["var(--violet)", "var(--violet-bg)"],
  };
  const warmBg = {
    amber: "var(--m-amber-bg)", green: "var(--m-green-bg)",
    red: "var(--m-red-bg)", blue: "var(--m-blue-bg)",
  };
  const [fg, bg] = cool[tone] || cool.slate;
  const background = warm && warmBg[tone] ? warmBg[tone] : bg;

  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontSize: 12, fontWeight: warm ? 700 : 600, lineHeight: 1.35,
        padding: warm ? "5px 10px" : "4px 10px",
        borderRadius: warm ? 9 : "var(--radius-xs)",
        color: fg, background, whiteSpace: "nowrap",
      }}
      {...rest}
    >
      {dot && <span style={{ width: 6, height: 6, borderRadius: "50%", background: fg }} />}
      {children}
    </span>
  );
}
