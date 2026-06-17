import * as React from "react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. `primary` = brand green CTA; `outline` = secondary; `ghost` = low-emphasis; `danger` = destructive (request changes); `whatsapp` = notify action. */
  variant?: "primary" | "outline" | "ghost" | "danger" | "whatsapp";
  /** Size. Default `md`. Use `lg` for primary mobile actions (min 44px tap target). */
  size?: "sm" | "md" | "lg";
  /** Optional leading icon node (15px SVG). */
  iconLeft?: React.ReactNode;
  /** Optional trailing icon node. */
  iconRight?: React.ReactNode;
  /** Stretch to fill container width. */
  full?: boolean;
  /** Render as a different element, e.g. "a". Default "button". */
  as?: "button" | "a";
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Primary action control for the LBM Portal.
 * @startingPoint section="Components" subtitle="Brand button with variants, sizes, icons" viewport="700x150"
 */
export function Button(props: ButtonProps): JSX.Element;
