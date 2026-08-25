// QuickBooks Online integration for the Invoices section.
//
// Auth model — Intuit OAuth 2.0 (authorization code, confidential client):
//  - QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET come from the Intuit
//    developer app. One-time browser authorization
//    (/api/quickbooks/oauth/start → /callback) yields a refresh token plus the
//    `realmId` (the company file) as a callback query param.
//  - Access tokens live ~1h; refresh tokens live 100 days and ROTATE on every
//    refresh — the newly returned refresh_token must be persisted or the
//    connection dies. refresh_issued_at tracks the 100-day clock so Settings
//    can warn before it lapses.
//  - Tokens are persisted in `oauth_tokens` (provider = 'quickbooks'); the
//    realm id lands in that row's `realm_id` column. QUICKBOOKS_REALM_ID, if
//    set, overrides it (handy for a sandbox company).
//  - QUICKBOOKS_ENVIRONMENT=sandbox points the API at sandbox-quickbooks.
//
// Invoices are read from QBO's Invoice entity and normalized to the Invoice
// shape below — everything downstream (admin table, client tab, filters,
// CSV/PDF export) consumes that shape and needs no changes. Until the OAuth
// connect flow has been completed, getInvoices() returns DUMMY_INVOICES so the
// prototype still demos.
//
// `clientName` matches the same string used everywhere else in this app
// (ClickUp's "Client Name (AM)" value, see MappedTask.clientName) so an
// invoice's client can be resolved the same way a video's client is — it maps
// to the QBO CustomerRef display name, so those must agree.

import { db } from '@/lib/db';
import { oauthTokens } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type InvoiceStatus = 'Paid' | 'Pending' | 'Overdue' | 'Draft';

export interface Invoice {
  id: string;
  clientName: string;
  date: string;        // ISO — issued date (QBO TxnDate)
  due: string;          // ISO — due date (QBO DueDate)
  description: string;  // QBO Line[0].Description
  amount: number;       // QBO TotalAmt
  status: InvoiceStatus; // derived from QBO Balance vs. DueDate
}

const PROVIDER = 'quickbooks';
const AUTH_URL = process.env.QUICKBOOKS_OAUTH_AUTH_URL || 'https://appcenter.intuit.com/connect/oauth2';
const TOKEN_URL = process.env.QUICKBOOKS_OAUTH_TOKEN_URL || 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const SCOPES = process.env.QUICKBOOKS_OAUTH_SCOPES || 'com.intuit.quickbooks.accounting';
const API_BASE = process.env.QUICKBOOKS_ENVIRONMENT === 'sandbox'
  ? 'https://sandbox-quickbooks.api.intuit.com'
  : 'https://quickbooks.api.intuit.com';
// Intuit's refresh tokens are valid 100 days from issue (rotation keeps the
// same clock), so warn well before that.
const REFRESH_TTL_DAYS = Number(process.env.QUICKBOOKS_REFRESH_TTL_DAYS) || 100;

export class QuickBooksError extends Error {
  status?: number;
  constructor(msg: string, status?: number) {
    super(msg);
    this.name = 'QuickBooksError';
    this.status = status;
  }
}

// Status derivation: Balance === 0 -> Paid. Balance > 0 && DueDate in the
// future -> Pending. Balance > 0 && DueDate past -> Overdue. "Draft" is
// LBM-internal (not yet sent) and is filtered out before anything reaches the
// client portal.
const DUMMY_INVOICES: Invoice[] = [
  { id: 'INV-1041', clientName: 'Sebastian Velasquez', date: '2026-04-01', due: '2026-04-15', description: 'April social retainer — 8 videos', amount: 3200, status: 'Paid' },
  { id: 'INV-1052', clientName: 'Sebastian Velasquez', date: '2026-05-01', due: '2026-05-15', description: 'May social retainer — 8 videos', amount: 3200, status: 'Paid' },
  { id: 'INV-1067', clientName: 'Sebastian Velasquez', date: '2026-06-01', due: '2026-06-15', description: 'June social retainer — 8 videos', amount: 3200, status: 'Paid' },
  { id: 'INV-1083', clientName: 'Sebastian Velasquez', date: '2026-06-22', due: '2026-06-29', description: 'Reel boost — paid ad spend passthrough', amount: 450, status: 'Paid' },
  { id: 'INV-1094', clientName: 'Sebastian Velasquez', date: '2026-07-01', due: '2026-07-15', description: 'July social retainer — 8 videos', amount: 3200, status: 'Pending' },
  { id: 'INV-1101', clientName: 'Sebastian Velasquez', date: '2026-07-08', due: '2026-07-08', description: 'August production planning (draft)', amount: 3200, status: 'Draft' },
  { id: 'INV-1029', clientName: 'Adam', date: '2026-03-10', due: '2026-03-24', description: 'Brand promo film — deposit (50%)', amount: 2500, status: 'Paid' },
  { id: 'INV-1058', clientName: 'Adam', date: '2026-05-12', due: '2026-05-26', description: 'Brand promo film — final delivery (50%)', amount: 2500, status: 'Paid' },
  { id: 'INV-1076', clientName: 'Adam', date: '2026-06-05', due: '2026-06-19', description: 'YouTube pre-roll cutdown — 3 versions', amount: 900, status: 'Overdue' },
  { id: 'INV-1088', clientName: 'Adam', date: '2026-06-27', due: '2026-07-11', description: 'Gym walkthrough — one-time shoot', amount: 1800, status: 'Pending' },
  { id: 'INV-1099', clientName: 'Adam', date: '2026-07-05', due: '2026-07-19', description: 'Additional revision round — color pass', amount: 350, status: 'Pending' },
];

/** Credentials present — not the same as "authorized" (see isQuickBooksConnected). */
export function isQuickBooksConfigured(): boolean {
  return Boolean(process.env.QUICKBOOKS_CLIENT_ID && process.env.QUICKBOOKS_CLIENT_SECRET);
}

function clientId(): string {
  const id = process.env.QUICKBOOKS_CLIENT_ID;
  if (!id) throw new QuickBooksError('QUICKBOOKS_CLIENT_ID not set');
  return id;
}

function clientSecret(): string {
  const secret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!secret) throw new QuickBooksError('QUICKBOOKS_CLIENT_SECRET not set');
  return secret;
}

// ── OAuth: authorization URL + code exchange ─────────────────────────────────

export function buildAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: clientId(),
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: redirectUri,
    state,
  });
  return `${AUTH_URL}?${q.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

// Intuit expects client_id/client_secret as HTTP Basic auth on the token
// endpoint (not in the body, unlike Adobe IMS).
async function postToken(params: Record<string, string>): Promise<TokenResponse> {
  const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Basic ${basic}`,
    },
    body: new URLSearchParams(params),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new QuickBooksError(
      `QuickBooks token request failed (${res.status}): ${data.error ?? ''} ${data.error_description ?? ''}`.trim(),
      res.status,
    );
  }
  return data;
}

/**
 * Exchange the authorization code for tokens and persist them along with the
 * realm (company) id Intuit returns on the callback. Sets refresh_issued_at =
 * now (the 100-day reauth clock) and clears any prior alert.
 */
export async function exchangeAndStoreTokens(code: string, redirectUri: string, realmId: string): Promise<void> {
  const data = await postToken({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  const now = new Date();
  const row = {
    provider: PROVIDER,
    accessToken: data.access_token!,
    refreshToken: data.refresh_token ?? null,
    realmId,
    expiresAt: new Date(now.getTime() + (data.expires_in ?? 3600) * 1000),
    refreshIssuedAt: now,
    alertedAt: null,
    updatedAt: now,
  };
  await db.insert(oauthTokens).values(row).onConflictDoUpdate({ target: oauthTokens.provider, set: row });
}

// Refresh the access token. Intuit ROTATES refresh tokens, so whatever comes
// back replaces the stored one; refresh_issued_at moves with it because the
// 100-day window restarts on each rotation.
async function refreshAccessToken(refreshToken: string): Promise<string> {
  const data = await postToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  const now = new Date();
  await db
    .update(oauthTokens)
    .set({
      accessToken: data.access_token!,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: new Date(now.getTime() + (data.expires_in ?? 3600) * 1000),
      refreshIssuedAt: now,
      alertedAt: null,
      updatedAt: now,
    })
    .where(eq(oauthTokens.provider, PROVIDER));
  return data.access_token!;
}

async function getAuth(): Promise<{ token: string; realmId: string }> {
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER)).limit(1);
  if (!row || !row.refreshToken) {
    throw new QuickBooksError('QuickBooks is not connected — authorize it in Settings.');
  }
  const realmId = process.env.QUICKBOOKS_REALM_ID || row.realmId;
  if (!realmId) throw new QuickBooksError('QuickBooks company (realm) id is missing — reconnect in Settings.');

  if (row.accessToken && row.expiresAt && row.expiresAt.getTime() > Date.now() + 60_000) {
    return { token: row.accessToken, realmId };
  }
  try {
    return { token: await refreshAccessToken(row.refreshToken), realmId };
  } catch {
    throw new QuickBooksError('QuickBooks authorization expired — re-authorize it in Settings.');
  }
}

/** Revoke the stored tokens with Intuit and forget them locally. */
export async function disconnect(): Promise<void> {
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER)).limit(1);
  if (row?.refreshToken && isQuickBooksConfigured()) {
    const basic = Buffer.from(`${clientId()}:${clientSecret()}`).toString('base64');
    await fetch(process.env.QUICKBOOKS_OAUTH_REVOKE_URL || 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
      body: JSON.stringify({ token: row.refreshToken }),
      cache: 'no-store',
    }).catch(() => {/* local disconnect still proceeds */});
  }
  await db.delete(oauthTokens).where(eq(oauthTokens.provider, PROVIDER));
}

// ── Connection status (Settings card) ────────────────────────────────────────

export interface QuickBooksConnection {
  connected: boolean;
  configured: boolean;
  realmId: string | null;
  refreshIssuedAt: Date | null;
  reauthDeadline: Date | null;
  daysUntilReauth: number | null;
  needsReauth: boolean;
}

export async function getConnectionStatus(): Promise<QuickBooksConnection> {
  const configured = isQuickBooksConfigured();
  const [row] = await db.select().from(oauthTokens).where(eq(oauthTokens.provider, PROVIDER)).limit(1);
  if (!row || !row.refreshToken || !row.refreshIssuedAt) {
    return { connected: false, configured, realmId: null, refreshIssuedAt: null, reauthDeadline: null, daysUntilReauth: null, needsReauth: true };
  }
  const deadline = new Date(row.refreshIssuedAt.getTime() + REFRESH_TTL_DAYS * 86_400_000);
  const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86_400_000);
  return {
    connected: true,
    configured,
    realmId: process.env.QUICKBOOKS_REALM_ID || row.realmId,
    refreshIssuedAt: row.refreshIssuedAt,
    reauthDeadline: deadline,
    daysUntilReauth: daysLeft,
    needsReauth: daysLeft <= 0,
  };
}

/** True once QuickBooks is both configured and authorized — gates the UI. */
export async function isQuickBooksConnected(): Promise<boolean> {
  if (!isQuickBooksConfigured()) return false;
  try {
    const status = await getConnectionStatus();
    return status.connected && !status.needsReauth;
  } catch {
    return false;
  }
}

// ── Invoice read path ────────────────────────────────────────────────────────

interface QboInvoice {
  Id?: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { name?: string; value?: string };
  CustomerMemo?: { value?: string };
  Line?: { Description?: string; DetailType?: string }[];
}

function toIsoDate(value: string | undefined): string {
  // QBO already returns yyyy-MM-dd for TxnDate/DueDate.
  return value ?? '';
}

function deriveStatus(inv: QboInvoice): InvoiceStatus {
  const balance = inv.Balance ?? 0;
  if (balance <= 0) return 'Paid';
  const due = inv.DueDate ? Date.parse(inv.DueDate) : NaN;
  if (!Number.isNaN(due) && due < Date.now()) return 'Overdue';
  return 'Pending';
}

export function mapQboInvoice(inv: QboInvoice): Invoice {
  const description =
    inv.Line?.find(l => l.DetailType !== 'SubTotalLineDetail' && l.Description)?.Description
    ?? inv.CustomerMemo?.value
    ?? '';
  return {
    id: inv.DocNumber || inv.Id || '',
    clientName: inv.CustomerRef?.name ?? '',
    date: toIsoDate(inv.TxnDate),
    due: toIsoDate(inv.DueDate || inv.TxnDate),
    description,
    amount: inv.TotalAmt ?? 0,
    status: deriveStatus(inv),
  };
}

async function query<T>(statement: string): Promise<T> {
  const { token, realmId } = await getAuth();
  const url = `${API_BASE}/v3/company/${realmId}/query?query=${encodeURIComponent(statement)}&minorversion=75`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new QuickBooksError(`QuickBooks query failed (${res.status}): ${body.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

// QBO caps a query at 1000 rows, so page with STARTPOSITION/MAXRESULTS.
async function fetchFromQuickBooks(): Promise<Invoice[]> {
  const PAGE = 500;
  const out: Invoice[] = [];
  for (let start = 1; ; start += PAGE) {
    const data = await query<{ QueryResponse?: { Invoice?: QboInvoice[] } }>(
      `select * from Invoice order by TxnDate desc startposition ${start} maxresults ${PAGE}`,
    );
    const rows = data.QueryResponse?.Invoice ?? [];
    out.push(...rows.map(mapQboInvoice));
    if (rows.length < PAGE) break;
  }
  return out;
}

/** All invoices — used by the admin/AM table. */
export async function getInvoices(): Promise<Invoice[]> {
  if (isQuickBooksConfigured()) {
    try {
      return await fetchFromQuickBooks();
    } catch {
      // fall through to dummy data rather than breaking the page
    }
  }
  return DUMMY_INVOICES;
}

/** Invoices visible to a given client — Draft (unsent) rows are LBM-internal only. */
export async function getInvoicesForClient(clientName: string): Promise<Invoice[]> {
  const all = await getInvoices();
  return all.filter(inv => inv.clientName === clientName && inv.status !== 'Draft');
}

/** Read-only auth diagnostics. Never returns secrets. */
export async function authDiagnostics(): Promise<Record<string, unknown>> {
  const base = {
    clientIdSet: !!process.env.QUICKBOOKS_CLIENT_ID,
    clientSecretSet: !!process.env.QUICKBOOKS_CLIENT_SECRET,
    environment: process.env.QUICKBOOKS_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production',
    apiBase: API_BASE,
  };
  try {
    const status = await getConnectionStatus();
    const { token } = await getAuth();
    return { ...base, connection: status, tokenObtained: true, tokenPrefix: token.slice(0, 8) + '…' };
  } catch (e) {
    return { ...base, tokenObtained: false, error: e instanceof Error ? e.message : String(e) };
  }
}
