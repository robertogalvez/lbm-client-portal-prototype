import type { MappedTask } from '@/lib/clickup';

// Per-client pipeline snapshot: raw footage waiting to be edited (supply health)
// plus what's left downstream toward publishing.
export interface PipelineReportClient {
  name: string;
  newFootage: number;      // Not Ready + Not Assigned + In Progress (Editor)
  corrections: number;     // In Progress (Corrections)
  qc: number;              // TC/QC (Somu) + QC Final – AM
  clientReview: number;    // For Client Review
  readyToPublish: number;  // Ready to be Posted
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

const NEW_FOOTAGE_STATUSES = new Set(['not ready', 'not assigned', 'in progress (editor)']);
const QC_STATUSES = new Set(['tc - qc (somu)', 'qc final - am']);

export function buildPipelineReport(tasks: MappedTask[]): PipelineReportClient[] {
  const map = new Map<string, PipelineReportClient>();
  for (const t of tasks) {
    const name = t.clientName ?? 'Unknown';
    if (!map.has(name)) {
      map.set(name, { name, newFootage: 0, corrections: 0, qc: 0, clientReview: 0, readyToPublish: 0 });
    }
    const r = map.get(name)!;
    const s = norm(t.status);
    if (NEW_FOOTAGE_STATUSES.has(s)) r.newFootage++;
    else if (s === 'in progress (corrections)') r.corrections++;
    else if (QC_STATUSES.has(s)) r.qc++;
    else if (s === 'for client review') r.clientReview++;
    else if (s === 'ready to be posted') r.readyToPublish++;
  }
  return Array.from(map.values());
}
