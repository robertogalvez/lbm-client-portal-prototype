export function parseClickUpDate(s: string): number {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}
