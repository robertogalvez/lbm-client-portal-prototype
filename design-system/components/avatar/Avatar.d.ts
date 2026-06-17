import * as React from "react";

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** 2-letter initials, e.g. "SM". */
  initials: string;
  /** Background color key. Pick a stable color per person. */
  color?: "brand" | "slate" | "blue" | "amber" | "violet" | "red";
  /** sm=22px, md=28px, lg=34px. */
  size?: "sm" | "md" | "lg";
}

/**
 * Initials avatar for account managers, editors, and clients.
 * @startingPoint section="Components" subtitle="Initials avatar, 3 sizes & palette" viewport="700x110"
 */
export function Avatar(props: AvatarProps): JSX.Element;
