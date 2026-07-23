// Mark a task as failed to post: notify in the ClickUp task comments and set the
// "Posted Status" dropdown to "Posting Failed". Used both at schedule time
// (publish-video) and at publish time (the capture poller, for Vista Social's
// random async failures) — the single choke point for every failure source,
// so the AM email/SMS notice lives here rather than duplicated per caller.

import * as clickup from '@/lib/clickup-write';
import { notifyAmOfPublishResult } from '@/lib/notify-am';

export function amNameFromTask(task: clickup.ClickUpTaskLite): string | null {
  const amField = clickup.findField(task, 'Account Manager (AM)');
  const amUsers = amField?.value as { username?: string }[] | undefined;
  return amUsers?.[0]?.username ?? null;
}

export async function markPostingFailed(task: clickup.ClickUpTaskLite, comment: string): Promise<void> {
  await clickup.postComment(task.id, comment);
  // No-ops if the "Posting Failed" option isn't on the field yet.
  await clickup.setDropdownByName(task, clickup.FIELD.postedStatus, clickup.POSTED_STATUS.failed);
  await notifyAmOfPublishResult({
    assignedAmName: amNameFromTask(task),
    taskId: task.id,
    videoTitle: task.name,
    result: 'error',
    reason: comment,
  });
}
