// The data behind screen 3 — the client detail page. Lives in lib/ rather
// than in the API route because the page loads it server-side on first paint
// and the route serves the same shape for client-side refreshes after a save.

import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { authUsers, clients as clientsTable, contractPeriods, contractMonths, contractPeriodClients, contractLineItems } from '@/lib/db/schema';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { buildAdminRows, type AdminClientRow } from '@/lib/admin-views';
import { norm, parseDate, POSTED, pipelineStageOf, ARCHIVED_STATUSES } from '@/lib/pipeline';
import type { ContractJoinRow } from '@/lib/portfolio';
import { resolvePostedAt } from '@/lib/portfolio';
import type { ContractPeriodRecord } from '@/lib/contract-records';
import type { SocialLinks } from '@/lib/socialLinks';

export interface PortalUser {
  id: string;
  name: string;
  email: string;
  clientName: string | null;
  emailVerified: boolean;
}

export interface ClientPortalData {
  clickupTaskId: string;
  clientStatus: string | null;
  lastSyncedAt: string | null;
  showCalendar: boolean;
  showInvoices: boolean;
  showReport: boolean;
  notifyEmail: boolean;
  portalUsers: PortalUser[];
}

export interface LedgerRow {
  id: string;
  title: string;
  /** The real ClickUp status, humanized — "Not ready", "QC Final (Daniel)" —
   *  plus a wait-time suffix for client review. Never a collapsed stage name
   *  like "In backlog": that hid the difference between Backlog and Not
   *  Ready, which read as a data bug when compared against ClickUp. */
  stateLabel: string;
  tone: 'ok' | 'warn' | 'danger' | 'info' | 'mute';
  /** ISO. The old ledger rendered "Invalid Date" on every row. */
  date: string | null;
  frameLink: string | null;
  /** https://app.clickup.com/t/<id> — null only if the task id itself is missing. */
  clickupUrl: string | null;
  /** Scope-matching flags, independent of stateLabel's wording. */
  waitingOnClient: boolean;
  published: boolean;
  /**
   * Dead in ClickUp — archived, or discarded without posting. These are
   * hidden by default: they are not work anyone can act on, and they made the
   * ledger several times longer than the live pipeline it is meant to show.
   */
  archived: boolean;
}

// Capitalizes each word in a raw ClickUp status ("qc final (daniel)") while
// keeping QC/TC as acronyms, so the ledger can show the literal status
// instead of a collapsed stage name.
function humanizeStatus(status: string): string {
  const LOWER = new Set(['in', 'to', 'on', 'of', 'a']);
  return status
    .split(' ')
    .map((word, i) => {
      const core = word.replace(/[a-z]+/gi, m =>
        i > 0 && LOWER.has(m.toLowerCase()) ? m.toLowerCase() : m[0].toUpperCase() + m.slice(1).toLowerCase(),
      );
      return core.replace(/\bQc\b/g, 'QC').replace(/\bTc\b/g, 'TC');
    })
    .join(' ');
}

// Pipeline order for the ledger's default sort — a client comparing this
// against ClickUp's "group by status" view expects work-in-progress order,
// not an arbitrary timestamp shuffle.
const STAGE_RANK: Record<string, number> = { backlog: 0, editing: 1, qc: 2, review: 3, ready: 4 };
function statusRank(status: string): number {
  const s = norm(status);
  if (ARCHIVED_STATUSES.has(s)) return 7;
  if (s === POSTED) return 6;
  const stage = pipelineStageOf(s);
  return stage ? STAGE_RANK[stage] : 5; // unclassified: after Ready, before Published
}

export interface ClientDetailData {
  row: AdminClientRow;
  displayName: string;
  ledger: LedgerRow[];
  socialLinks: SocialLinks | null;
  periods: ContractPeriodRecord[];
  /**
   * Delivered count for every period on this client, not just the current
   * one — the drawer used to show delivery figures for the current period
   * only, so a closed cycle's history was invisible. Computed the same way
   * as the current period's `delivered` (a real publish date inside the
   * period's own window), just repeated per period instead of once.
   */
  deliveredByPeriod: Record<string, number>;
  clickupTaskId: string | null;
  portal: ClientPortalData | null;
}

const DAY_MS = 86_400_000;


/** The real ClickUp status, humanized, plus who's holding it up for review. */
function ledgerState(status: string, waitDays: number): { stateLabel: string; tone: LedgerRow['tone'] } {
  const s = norm(status);
  const label = humanizeStatus(status);
  if (s === POSTED) return { stateLabel: label, tone: 'ok' };
  if (s === 'for client review') {
    return {
      stateLabel: `${label} · ${waitDays}d`,
      // Escalates past three weeks — a fortnight-old review and a
      // two-month-old one are not the same problem.
      tone: waitDays > 21 ? 'danger' : 'warn',
    };
  }
  if (ARCHIVED_STATUSES.has(s)) return { stateLabel: label, tone: 'mute' };
  const stage = pipelineStageOf(s);
  if (stage === 'editing' || stage === 'qc') return { stateLabel: label, tone: 'info' };
  if (stage === 'ready') return { stateLabel: label, tone: 'ok' };
  return { stateLabel: label, tone: 'mute' }; // backlog, unclassified
}

/**
 * Everything screen 3 renders for one contract period. Returns null when the
 * period does not exist, so the page can 404 and the API can 404.
 */
export async function loadClientDetail(id: string): Promise<ClientDetailData | null> {
  const [period] = await db.select().from(contractPeriods).where(eq(contractPeriods.id, id));
  if (!period) return null;

  // This period's client set — a joint contract has more than one — falling
  // back to the legacy direct clientId column for any period the backfill
  // hasn't reached.
  const thisPeriodClients = await db.select({ clientId: contractPeriodClients.clientId })
    .from(contractPeriodClients).where(eq(contractPeriodClients.periodId, id));
  const periodClientIds = thisPeriodClients.length > 0 ? thisPeriodClients.map(c => c.clientId) : [period.clientId];

  const clientRows = await db.select().from(clientsTable).where(inArray(clientsTable.id, periodClientIds));
  const displayName = clientRows.map(c => c.name).join(' & ') || 'Unknown';

  // Every period sharing ANY client with this one, so a joint contract's
  // history reads correctly for either party.
  const [sharedViaJoin, sharedViaLegacyColumn] = await Promise.all([
    db.select({ periodId: contractPeriodClients.periodId }).from(contractPeriodClients).where(inArray(contractPeriodClients.clientId, periodClientIds)),
    db.select({ id: contractPeriods.id }).from(contractPeriods).where(inArray(contractPeriods.clientId, periodClientIds)),
  ]);
  const relatedPeriodIds = [...new Set([id, ...sharedViaJoin.map(r => r.periodId), ...sharedViaLegacyColumn.map(r => r.id)])];
  const allPeriods = await db.select().from(contractPeriods).where(inArray(contractPeriods.id, relatedPeriodIds)).orderBy(contractPeriods.startsOn);

  const periodIds = allPeriods.map(p => p.id);
  const [allMonths, allLineItems, allPeriodClients] = periodIds.length > 0
    ? await Promise.all([
        db.select().from(contractMonths).where(inArray(contractMonths.periodId, periodIds)),
        db.select().from(contractLineItems).where(inArray(contractLineItems.periodId, periodIds)),
        db.select().from(contractPeriodClients).where(inArray(contractPeriodClients.periodId, periodIds)),
      ])
    : [[], [], []];

  const [primaryClient] = clientRows.filter(c => c.id === period.clientId);
  const { tasks: allTasks } = await getDashboardTasks();
  const now = new Date();

  // The page's numbers come from the same builder the Dashboard and the
  // Clients tabs use, so a client's coverage here is the row they saw there.
  // A joint contract is measured across all of its clients, which is why the
  // join row carries whichever option id is resolved.
  const joinRow: ContractJoinRow = {
    id: period.id,
    clientName: displayName,
    clickupClientOptionId: clientRows.find(c => c.clickupClientOptionId)?.clickupClientOptionId ?? null,
    label: period.label,
    startsOn: period.startsOn,
    endsOn: period.endsOn,
    model: period.model,
    contractedTotal: period.contractedTotal,
    state: period.state,
    cycleDurationDays: period.cycleDurationDays,
    cycleAnchorDate: period.cycleAnchorDate,
  };
  const optionIds = new Set(clientRows.map(c => c.clickupClientOptionId).filter(Boolean) as string[]);
  const nameFallback = new Set(clientRows.filter(c => !c.clickupClientOptionId).map(c => norm(c.name)));
  const clientTasks = allTasks.filter(t =>
    (t.clientOptionId != null && optionIds.has(t.clientOptionId)) || nameFallback.has(norm(t.clientName ?? '')),
  );

  const [row] = buildAdminRows([{
    clientId: period.clientId,
    clientName: displayName,
    billing: (primaryClient?.type ?? null) as 'retainer' | 'one_time' | null,
    portalUserCount: 0,
    period: joinRow,
  }], clientTasks, now);

  const ledger: LedgerRow[] = clientTasks
    .map(t => {
      const updated = parseDate(t.dateUpdated);
      const valid = Number.isFinite(updated) && updated > 0;
      const waitDays = valid ? Math.max(0, Math.floor((now.getTime() - updated) / DAY_MS)) : 0;
      const s = norm(t.status);
      return {
        id: t.clickupTaskId,
        title: t.clientFacingTitle ?? t.title,
        ...ledgerState(t.status, waitDays),
        date: valid ? new Date(updated).toISOString() : null,
        frameLink: t.frameLink,
        clickupUrl: t.clickupTaskId ? `https://app.clickup.com/t/${t.clickupTaskId}` : null,
        waitingOnClient: s === 'for client review',
        published: s === POSTED,
        archived: ARCHIVED_STATUSES.has(s),
        rank: statusRank(t.status),
        sortKey: valid ? updated : 0,
      };
    })
    // Grouped by where the video sits in the pipeline (matching ClickUp's own
    // "group by status" view), newest first within each status.
    .sort((a, b) => a.rank - b.rank || b.sortKey - a.sortKey)
    .map(r => { const { rank, sortKey, ...rest } = r; void rank; void sortKey; return rest; });

  const periods: ContractPeriodRecord[] = allPeriods.map(p => ({
    ...p,
    months: allMonths.filter(m => m.periodId === p.id),
    lineItems: allLineItems.filter(li => li.periodId === p.id),
    clientIds: allPeriodClients.filter(pc => pc.periodId === p.id).map(pc => pc.clientId),
  }));

  // Same delivered definition as the current period (a real publish date
  // inside the period's own window), computed for every period so a closed
  // cycle's history shows in the drawer instead of just its total.
  const deliveredByPeriod: Record<string, number> = {};
  for (const p of allPeriods) {
    const start = new Date(p.startsOn).getTime();
    const end = p.endsOn ? new Date(p.endsOn).getTime() : now.getTime();
    deliveredByPeriod[p.id] = clientTasks.filter(t => {
      if (norm(t.status) !== POSTED) return false;
      const postedAt = resolvePostedAt(t);
      return postedAt >= start && postedAt <= end;
    }).length;
  }

  // Portal settings and users are a per-client concept, so they are scoped to
  // the primary client rather than a joint contract's combined name.
  const portalUsers = primaryClient
    ? await db.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, clientName: authUsers.clientName, emailVerified: authUsers.emailVerified })
        .from(authUsers).where(eq(authUsers.clientName, primaryClient.name))
    : [];

  const data: ClientDetailData = {
    row,
    displayName,
    ledger,
    socialLinks: (primaryClient?.socialLinks ?? null) as SocialLinks | null,
    periods,
    deliveredByPeriod,
    clickupTaskId: primaryClient?.clickupTaskId ?? null,
    portal: primaryClient ? {
      clickupTaskId: primaryClient.clickupTaskId,
      clientStatus: primaryClient.clientStatus,
      lastSyncedAt: primaryClient.lastSyncedAt ? primaryClient.lastSyncedAt.toISOString() : null,
      showCalendar: primaryClient.showCalendar ?? false,
      showInvoices: primaryClient.showInvoices ?? false,
      showReport: primaryClient.showReport ?? false,
      notifyEmail: primaryClient.notifyEmail ?? true,
      portalUsers,
    } : null,
  };

  return data;
}
