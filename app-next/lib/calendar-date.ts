// Contract dates are calendar dates, not instants.
//
// `new Date('2026-02-10')` parses as UTC midnight, so formatting it with
// toLocaleDateString renders "Feb 10" on a UTC server and "Feb 9" in a browser
// west of Greenwich. That is exactly what the portal did: the client detail
// header (server-rendered) and the contract drawer (client-rendered) disagreed
// by one day on every contract — confirmed on Hector, Clear Exteriors, Adam and
// Volvi.
//
// Everything that renders a `date` column must go through here.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parse a YYYY-MM-DD calendar date into its parts, ignoring timezones entirely. */
function parts(value: string | Date): { y: number; m: number; d: number } | null {
  if (value instanceof Date) {
    return { y: value.getFullYear(), m: value.getMonth() + 1, d: value.getDate() };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** "Feb 10, 2026" — identical on the server and in every browser. */
export function fmtCalendarDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const p = parts(value);
  if (!p) return String(value);
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`;
}

/** Local midnight for a calendar date, for day arithmetic that must not shift. */
export function calendarDateToLocal(value: string | Date): Date {
  const p = parts(value);
  if (!p) return new Date(value);
  return new Date(p.y, p.m - 1, p.d);
}

/** Whole days from `from` to `to`, counted in calendar days. */
export function calendarDaysBetween(from: string | Date, to: string | Date): number {
  const a = calendarDateToLocal(from);
  const b = calendarDateToLocal(to);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
