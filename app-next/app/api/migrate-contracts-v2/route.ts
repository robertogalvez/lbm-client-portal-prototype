import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// One-time migration of the 6 already-seeded contract_periods rows (see
// app/api/seed-contracts) onto the redesigned schema: dataQualityFlag,
// renewedFromPeriodId, and per-deliverable-type contract_line_items. Reads
// the CURRENT DB rows rather than re-deriving from the Excel source — those
// rows are the more authoritative "what we actually recorded," and
// re-parsing the spreadsheet risks reintroducing inconsistencies already
// resolved once during the original seed. Matches periods the same way
// seed-contracts does: normalized client-name substring + period label.
//
// contract_period_clients is NOT touched here — PR 1's
// /api/admin/contracts/backfill-period-clients already covers every
// existing period (1 row per period, copied from the old clientId column).

type FlagSeed = { clientMatch: string; label: string; flag: string };

const DATA_QUALITY_FLAGS: FlagSeed[] = [
  {
    clientMatch: 'adam',
    label: 'Contract 1',
    flag: 'ledger_past_contract_end: Ledger runs past this contract\'s end date; dates left as-authored, not corrected.',
  },
  {
    clientMatch: 'volvi',
    label: 'Contract 1',
    flag: 'source_scope_mismatch: Sheet\'s own Original Contract Scope (24) and Total Managed Deliverables (16) disagree; contractedTotal uses 16. Reconcile with LBM before relying on this number.',
  },
  {
    clientMatch: 'saeed',
    label: 'Contract 1',
    flag: 'source_conflicting_sheets: Inventory tab (12/mo, 3x/week) conflicts with Strategic Framework tab (8/mo, 2x/week); this row uses Inventory.',
  },
];

// The one known real renewal in the seeded data.
const RENEWAL: { fromClientMatch: string; fromLabel: string; toClientMatch: string; toLabel: string } = {
  fromClientMatch: 'volvi', fromLabel: 'Contract 1',
  toClientMatch: 'volvi', toLabel: 'Contract 2',
};

type LineItemSeed = {
  clientMatch: string;
  label: string;
  items: { deliverableType: string; contractedTotal: number; monthlyQuota: number | null; note?: string }[];
};

const LINE_ITEMS: LineItemSeed[] = [
  {
    clientMatch: 'adam',
    label: 'Contract 1',
    items: [
      { deliverableType: 'short_form', contractedTotal: 48, monthlyQuota: 16 },
      { deliverableType: 'youtube', contractedTotal: 6, monthlyQuota: null },
      { deliverableType: 'website', contractedTotal: 1, monthlyQuota: null },
      { deliverableType: 'ad', contractedTotal: 8, monthlyQuota: null },
    ],
  },
  {
    clientMatch: 'hector',
    label: 'Contract 1',
    items: [
      { deliverableType: 'short_form', contractedTotal: 60, monthlyQuota: 20 },
      { deliverableType: 'ad', contractedTotal: 10, monthlyQuota: null, note: '1 body + 9 hooks — both roll into this single line item; the pipeline only tracks one "ad" bucket.' },
    ],
  },
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, ' ').trim();
}

export async function POST(req: Request) {
  const secret = req.headers.get('x-migrate-secret');
  if (!process.env.MIGRATE_SECRET || secret !== process.env.MIGRATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 500 });

  const directUrl = dbUrl.replace('-pooler', '');

  try {
    const sql = neon(directUrl);

    const clientRows = await sql`SELECT id, name FROM clients`;
    const clientsList = clientRows as { id: string; name: string }[];

    async function findPeriodId(clientMatch: string, label: string): Promise<string | null> {
      const client = clientsList.find(c => normalize(c.name).includes(clientMatch));
      if (!client) return null;
      const rows = await sql`
        SELECT id FROM contract_periods WHERE client_id = ${client.id} AND label = ${label}
      `;
      return (rows as { id: string }[])[0]?.id ?? null;
    }

    const flaggedForReview: { clientMatch: string; label: string; flag: string }[] = [];
    const flagsNotMatched: string[] = [];
    for (const f of DATA_QUALITY_FLAGS) {
      const periodId = await findPeriodId(f.clientMatch, f.label);
      if (!periodId) { flagsNotMatched.push(`${f.clientMatch} / ${f.label}`); continue; }
      await sql`UPDATE contract_periods SET data_quality_flag = ${f.flag} WHERE id = ${periodId}`;
      flaggedForReview.push({ clientMatch: f.clientMatch, label: f.label, flag: f.flag });
    }

    let renewalLinked = false;
    let renewalNotMatched: string | null = null;
    {
      const fromId = await findPeriodId(RENEWAL.fromClientMatch, RENEWAL.fromLabel);
      const toId = await findPeriodId(RENEWAL.toClientMatch, RENEWAL.toLabel);
      if (fromId && toId) {
        await sql`UPDATE contract_periods SET renewed_from_period_id = ${fromId} WHERE id = ${toId}`;
        renewalLinked = true;
      } else {
        renewalNotMatched = `${RENEWAL.fromClientMatch} / ${RENEWAL.fromLabel} -> ${RENEWAL.toClientMatch} / ${RENEWAL.toLabel}`;
      }
    }

    const lineItemsCreated: string[] = [];
    const lineItemsSkippedExisting: string[] = [];
    const lineItemsNotMatched: string[] = [];
    for (const seed of LINE_ITEMS) {
      const periodId = await findPeriodId(seed.clientMatch, seed.label);
      if (!periodId) { lineItemsNotMatched.push(`${seed.clientMatch} / ${seed.label}`); continue; }

      for (const item of seed.items) {
        const existing = await sql`
          SELECT id FROM contract_line_items WHERE period_id = ${periodId} AND deliverable_type = ${item.deliverableType}
        `;
        if ((existing as { id: string }[]).length > 0) {
          lineItemsSkippedExisting.push(`${seed.clientMatch} / ${seed.label} / ${item.deliverableType}`);
          continue;
        }
        await sql`
          INSERT INTO contract_line_items (period_id, deliverable_type, contracted_total, monthly_quota, carried_in)
          VALUES (${periodId}, ${item.deliverableType}, ${item.contractedTotal}, ${item.monthlyQuota}, 0)
        `;
        lineItemsCreated.push(`${seed.clientMatch} / ${seed.label} / ${item.deliverableType}${item.note ? ` (${item.note})` : ''}`);
      }
    }

    return NextResponse.json({
      ok: true,
      flaggedForReview,
      flagsNotMatched,
      renewalLinked,
      renewalNotMatched,
      lineItemsCreated,
      lineItemsSkippedExisting,
      lineItemsNotMatched,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
