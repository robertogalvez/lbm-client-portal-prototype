// A2P 10DLC double opt-in for client SMS notifications — the exact flow
// registered with Twilio's campaign (see the "Message Flow" answer on the
// campaign form): an admin turns SMS on for a client, which sends this
// disclosure message; no real notification (lib/notify-client.ts) goes out
// until the client replies YES. The message text below must stay in sync
// with what's registered on the campaign — changing it without updating the
// campaign risks a compliance mismatch.

import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendSms, isSmsConfigured } from '@/lib/sms';

export const OPT_IN_MESSAGE =
  "LBM Media: You've been enrolled for portal notifications. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Terms: https://legacybuildingmedia.com/terms-and-conditions/ Privacy: https://legacybuildingmedia.com/privacy-policy/ Reply YES to confirm enrollment, or STOP to decline.";

// Same lists registered on the campaign form. Twilio's own Advanced
// Opt-Out feature intercepts these keywords at the carrier level before
// they reach our webhook (auto-replying with the registered opt-out/help
// message), so this app rarely sees them directly — the checks below are a
// fallback that keeps our own DB state (smsOptInStatus) correct if Advanced
// Opt-Out is ever off, or a variant slips through.
const OPT_OUT_KEYWORDS = ['CANCEL', 'QUIT', 'STOP', 'OPTOUT', 'UNSUBSCRIBE', 'STOPALL', 'REVOKE', 'END'];
const CONFIRM_KEYWORDS = ['YES', 'Y'];

// Sends the disclosure message and marks the client 'pending'. Called when
// an admin turns notifySms on (see app/api/admin/clients/[id]/route.ts).
// Never sends twice to an already-confirmed client — re-toggling SMS off
// and back on for someone who already opted in shouldn't re-prompt them.
export async function startSmsOptIn(clientId: string): Promise<{ ok: boolean; error?: string }> {
  const [client] = await db
    .select({ whatsappNumber: clients.whatsappNumber, smsOptInStatus: clients.smsOptInStatus })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) return { ok: false, error: 'Client not found' };
  if (!client.whatsappNumber) return { ok: false, error: 'This client has no phone number on file — add one in ClickUp and re-sync first.' };
  if (client.smsOptInStatus === 'confirmed') return { ok: true };
  if (!isSmsConfigured()) return { ok: false, error: 'Twilio is not configured yet.' };

  const sent = await sendSms({ to: client.whatsappNumber, body: OPT_IN_MESSAGE });
  if (!sent) return { ok: false, error: 'Failed to send the opt-in text — check Twilio logs.' };

  await db.update(clients).set({ smsOptInStatus: 'pending' }).where(eq(clients.id, clientId));
  return { ok: true };
}

// Applies an inbound reply to the matching client's opt-in state. Matching
// is by whatsappNumber since that's the only identifier Twilio's webhook
// gives us (the `From` number). No-op if no client matches or the message
// isn't a recognized keyword — anything else is just conversational noise
// this flow doesn't act on.
export async function applyInboundSmsReply(fromNumber: string, body: string): Promise<void> {
  const normalized = body.trim().toUpperCase();
  let nextStatus: 'confirmed' | 'declined' | null = null;
  if (CONFIRM_KEYWORDS.includes(normalized)) nextStatus = 'confirmed';
  else if (OPT_OUT_KEYWORDS.includes(normalized)) nextStatus = 'declined';
  if (!nextStatus) return;

  await db.update(clients).set({ smsOptInStatus: nextStatus }).where(eq(clients.whatsappNumber, fromNumber));
}
