import * as React from "react";

export interface ProgressBarProps {
  /** Percent complete, 0–100. Bar turns green at 100. */
  value: number;
  /** Optional left label, e.g. "Tasks completed". */
  label?: React.ReactNode;
  /** Optional right value, e.g. "11 / 12 · 92%" (rendered mono). */
  right?: React.ReactNode;
  /** Use on warm/mobile surfaces for the right track color. */
  warm?: boolean;
}

/**
 * Task / package completion progress bar.
 * @startingPoint section="Components" subtitle="Progress bar with label row" viewport="700x110"
 */
export function ProgressBar(props: ProgressBarProps): JSX.Element;
