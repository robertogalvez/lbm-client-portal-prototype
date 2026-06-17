import * as React from "react";

export interface MetricCardProps {
  /** Metric name, e.g. "First-pass approval". */
  label: string;
  /** Color of the leading label dot. Default brand green. */
  dotColor?: string;
  /** The main number (string or node). Rendered in tabular mono. */
  value: React.ReactNode;
  /** Optional unit suffix, e.g. "%", "days". */
  unit?: string;
  /** Optional delta line (node) — include an arrow + comparison text. */
  delta?: React.ReactNode;
  /** `up` = green (good), `warn` = amber. Default `up`. */
  deltaTone?: "up" | "warn";
  /** Optional slot to the right of the value, e.g. a sparkline SVG. */
  children?: React.ReactNode;
}

/**
 * Dashboard KPI card with label, big mono value, delta, and optional sparkline.
 * @startingPoint section="Components" subtitle="KPI card with value, delta, sparkline" viewport="700x180"
 */
export function MetricCard(props: MetricCardProps): JSX.Element;
