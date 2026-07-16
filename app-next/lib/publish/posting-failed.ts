// Mark a task as failed to post: notify in the ClickUp task comments and set the
// "Posted Status" dropdown to "Posting Failed". Used both at schedule time
// (publish-video) and at publish time (the capture poller, for Vista Social's
// random async failures).

import * as clickup from '@/lib/clickup-write';

export async function markPostingFailed(task: clickup.ClickUpTaskLite, comment: string): Promise<void> {
  await clickup.postComment(task.id, comment);
  // No-ops if the "Posting Failed" option isn't on the field yet.
  await clickup.setDropdownByName(task, clickup.FIELD.postedStatus, clickup.POSTED_STATUS.failed);
}
