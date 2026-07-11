// QuickBooks Online integration seam for the Invoices section.
//
// Today QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET / QUICKBOOKS_REALM_ID
// are not set, so isConfigured() is false and getInvoices() returns
// DUMMY_INVOICES — shaped exactly like the normalized rows the app will get
// back from QBO's Invoice entity (DocNumber, TxnDate, DueDate, CustomerRef,
// Line[0].Description, TotalAmt, Balance -> derived status). Once the OAuth
// connect flow is wired up and those env vars are set, replace the body of
// fetchFromQuickBooks() with a real call — everything downstream (admin
// table, client tab, filters, CSV/PDF export) already consumes this same
// Invoice shape and needs no changes.
//
// `clientName` matches the same string used everywhere else in this app
// (ClickUp's "Client Name (AM)" value, see MappedTask.clientName) so an
// invoice's client can be resolved the same way a video's client is.

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

// Status derivation once real QBO data lands: Balance === 0 -> Paid.
// Balance > 0 && DueDate in the future -> Pending. Balance > 0 && DueDate
// past -> Overdue. "Draft" is LBM-internal (not yet sent) and is filtered
// out before anything reaches the client portal.
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

export function isQuickBooksConfigured(): boolean {
  return Boolean(
    process.env.QUICKBOOKS_CLIENT_ID &&
    process.env.QUICKBOOKS_CLIENT_SECRET &&
    process.env.QUICKBOOKS_REALM_ID
  );
}

async function fetchFromQuickBooks(): Promise<Invoice[]> {
  // TODO: once QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET /
  // QUICKBOOKS_REALM_ID are set and the OAuth connect flow is live, query
  // QBO's Invoice entity (e.g. via `node-quickbooks` or a direct REST call
  // to `/v3/company/{realmId}/query?query=select * from Invoice`), map each
  // result to the Invoice shape above, and return it here.
  throw new Error('QuickBooks is not configured yet');
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
