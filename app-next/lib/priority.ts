// Translates a client's exact drag-order rank (1 = highest) into ClickUp's
// native Priority field, which only has 4 coarse levels — the exact order
// itself lives only in video_priorities; ClickUp only ever sees the bucket.
// Only rank 1 becomes Urgent (keeps "urgent" meaningful instead of every
// video racing to the top), the next two become High, everything else Normal.
// "Low" is intentionally never set here — it's reserved for AM/internal use.

export type ClickUpPriority = 'urgent' | 'high' | 'normal' | 'low';

export function rankToClickUpPriority(rank: number): ClickUpPriority {
  if (rank === 1) return 'urgent';
  if (rank <= 3) return 'high';
  return 'normal';
}
