const LABELS: Record<string, string> = {
  'not ready': 'Backlog',
  'backlog': 'Backlog',
  'not assigned': 'Backlog',
  'in progress (editor)': 'In Editing',
  'in progress (corrections)': 'In Editing',
  'tc - qc (somu)': 'Quality Control',
  'qc final - am': 'Quality Control',
  'for client review': 'For Client Review',
  'ready to be posted': 'Ready to be posted',
  'posted in socials': 'Posted on socials',
  'not posted - discarded': 'Not Posted',
};

export function clientStatusLabel(status: string): string {
  const key = status.toLowerCase().replace(/\s+/g, ' ').trim();
  return LABELS[key] ?? status;
}
