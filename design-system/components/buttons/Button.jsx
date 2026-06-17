import React from "react";

/**
 * LBM Portal button. Flat, with a quick press-scale micro-interaction.
 * Works on both admin (cool) and client (warm) surfaces.
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  iconLeft = null,
  iconRight = null,
  disabled = false,
  full = false,
  as = "button",
  ...rest
}) {
  const Tag = as;
  const pad = size === "sm" ? "7px 12px" : size === "lg" ? "12px 16px" : "9px 15px";
  const fontSize = size === "sm" ? 13 : size === "lg" ? 15 : 13.5;

  const palettes = {
    primary: { background: "var(--brand)", color: "#fff", border: "1px solid transparent" },
    outline: { background: "var(--surface)", color: "var(--ink)", border: "1px solid var(--line-strong)" },
    ghost:   { background: "transparent", color: "var(--ink-2)", border: "1px solid transparent" },
    danger:  { background: "var(--red-bg)", color: "var(--red)", border: "1px solid var(--red-bg)" },
    whatsapp:{ background: "var(--whatsapp)", color: "#fff", border: "1px solid transparent" },
  };

  const base = {
    fontFamily: "var(--font-ui)",
    fontWeight: 600,
    fontSize,
    lineHeight: 1,
    borderRadius: "var(--radius-sm)",
    padding: pad,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    whiteSpace: "nowrap",
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "var(--tr-hover), transform var(--t-fast) var(--ease)",
    width: full ? "100%" : undefined,
    ...palettes[variant],
    ...(disabled ? { background: "#eef1f4", color: "var(--ink-3)", border: "1px solid var(--line)" } : null),
  };

  return (
    <Tag
      style={base}
      disabled={Tag === "button" ? disabled : undefined}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.97)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </Tag>
  );
}
