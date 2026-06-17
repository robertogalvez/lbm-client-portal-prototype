import * as React from "react";

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Color/meaning. blue=In Progress, amber=In Review/Awaiting, green=Approved/Done, red=Changes requested, slate=To Do, violet=QC. */
  tone?: "blue" | "amber" | "green" | "red" | "slate" | "violet";
  /** Use the warmer tint + heavier weight for mobile/client surfaces. */
  warm?: boolean;
  /** Show the leading status dot. Default true. */
  dot?: boolean;
  children?: React.ReactNode;
}

/**
 * Semantic status pill for video, task, and project state.
 * @startingPoint section="Components" subtitle="Semantic status pill, cool + warm" viewport="700x130"
 */
export function StatusBadge(props: StatusBadgeProps): JSX.Element;
