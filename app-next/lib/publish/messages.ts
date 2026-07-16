// AM-facing ClickUp comment messages, reproduced verbatim from the Make.com
// blueprint being replaced (plus the new capture message). Centralized so the
// publish service, capture poller, and tests all use the exact same strings.

export const AM_MESSAGES = {
  frameioStackFailed: (error: string) =>
    `🚨 Hey Account Manager! \nThe automation failed when trying to post the video.\nError message: ${error}\nPlease review the Frame.io link, fix if needed, and try posting the video again.`,

  frameioFileFailed: (error: string) =>
    `🚨 Hey Account Manager!\nThe automation failed fetching the video download link from Frame.io.\nError: ${error}\nPlease review the Frame.io link on this task and try again.`,

  noProfile: (clientName: string) =>
    `🚨 Hey Account Managers! \nNo Vista Social Profile ID was found for ${clientName}. \nPlease update the client's Vista Social profile IDs.`,

  publishFailed: (platforms: string, error: string) =>
    `🚨 Error when publishing on VistaSocial!\nPlatforms attempted: ${platforms}\nError: ${error}\nPlease check which platform's connection is broken in VistaSocial and reconnect it.`,

  publishSuccess: () =>
    `🚨 Hey Account Managers!  The video was successfully posted via VistaSocial.\n`,

  notSchedulable: () =>
    `🚨 Hey Account Manager! This video could not be scheduled.\n- Video is still processing\n- Captions field is empty\n- Publish Date is not set\n- Publish Date must be in the future\n\nOnce fixed, uncheck and re-check 'Ready to Publish?' to retry.`,

  validationFailed: () => `🚨 Validation failed`,

  // Vista Social reported the scheduled post failed at publish time (these random
  // failures happen). Posted to the task; "Posted Status" is set to Posting Failed.
  postingFailedAsync: (status: string) =>
    `🚨 Error when publishing on VistaSocial!\nThe post failed to publish (status: ${status}).\nPlease check the platform connection in VistaSocial and retry by setting "Posted Status" back to "Post on Socials".`,
} as const;
