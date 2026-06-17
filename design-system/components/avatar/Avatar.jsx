import React from "react";

/**
 * Initials avatar. Deterministic palette by `color`, three sizes.
 */
export function Avatar({ initials, color = "slate", size = "md", ...rest }) {
  const palette = {
    brand: "var(--brand)", slate: "#5e6b7a", blue: "#5172c4",
    amber: "#b58236", violet: "#7c66c4", red: "#cf5b53",
  };
  const dims = { sm: 22, md: 28, lg: 34 };
  const fonts = { sm: 9.5, md: 11, lg: 12.5 };
  const d = dims[size] || dims.md;

  return (
    <span
      style={{
        width: d, height: d, borderRadius: "50%",
        background: palette[color] || palette.slate, color: "#fff",
        display: "grid", placeItems: "center",
        fontFamily: "var(--font-ui)", fontWeight: 700,
        fontSize: fonts[size] || fonts.md, flex: "none", letterSpacing: "-.01em",
      }}
      {...rest}
    >
      {initials}
    </span>
  );
}
