import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// One-time seed of contract_periods / contract_months from the LBM Excel
// Inventory tab, for the clients the design handoff's worked examples cover
// (Adam, Volvi, Hector, Apex, Saeed, Jay & Kristina). Run once after the
// contract_periods/contract_months migration lands (see app/api/migrate).
// Matches by a normalized client name against the existing `clients` table
// rather than assuming exact production spellings — unmatched entries are
// reported, not silently skipped or invented.

type PeriodSeed = {
  clientMatch: string; // substring to match against normalize(clients.name)
  label: string;
  startsOn: string; // 'YYYY-MM-DD'
  endsOn: string | null;
  model: 'retainer' | 'package';
  cadencePerWeek: number | null;
  monthlyQuota: number | null;
  contractedTotal: number;
  state: 'active' | 'renewed' | 'extended' | 'paused' | 'completed';
  carriedIn: number;
  notes: string;
};

// Transcribed from uploads/Clients table.xlsx → Inventory tab, "Client
// Contract & Content Delivery Overview" and "Package-Based Clients"
// sections. "Total Managed Deliverables" (original + additional scope) is
// used as contractedTotal throughout for consistency; where that figure
// doesn't reconcile against "Original Contract Scope" in the source sheet,
// the sheet itself is internally inconsistent — noted per row rather than
// silently corrected.
// Production `clients.name` rows are first-name-only (confirmed via the
// route's own allClientNames diagnostic — e.g. "Adam", "Volvi", "Hector",
// "Saeed"), not "First Last" as the Inventory tab spells them. clientMatch
// below matches that reality. Apex Interior has no corresponding client row
// at all (not yet onboarded) — left out entirely rather than guessed at;
// re-add once that client exists. Jay & Kristina Rodriguez are two separate
// client rows in production ("Jay", "Kristina") with no way to represent a
// joint client, so the package is attached to "Jay" only.
const PERIODS: PeriodSeed[] = [
  {
    clientMatch: 'adam',
    label: 'Contract 1',
    startsOn: '2025-11-17',
    endsOn: '2026-02-15',
    model: 'retainer',
    cadencePerWeek: 4,
    monthlyQuota: 16, // 16 short-form/mo, per "Deliverables / month"
    contractedTotal: 63, // 48 short-form + 6 YouTube + 1 website + 8 ads
    state: 'extended', // marked "Extended Collaboration" in the source sheet
    carriedIn: 0,
    notes: 'Seeded from Inventory tab. Ledger runs past this contract\'s end date (known issue — see contract-schema-spec.md §11.2); dates left as-authored, not corrected here.',
  },
  {
    clientMatch: 'volvi',
    label: 'Contract 1',
    startsOn: '2026-01-20',
    endsOn: '2026-04-20',
    model: 'retainer',
    cadencePerWeek: 2,
    monthlyQuota: 8,
    contractedTotal: 16, // "Total Managed Deliverables" — the sheet's "Original Contract Scope" cell says 24; source is internally inconsistent
    state: 'renewed',
    carriedIn: 0,
    notes: 'Seeded from Inventory tab. Renewed into Contract 2 (Apr 21, 2026). Sheet\'s own "Original Contract Scope" (24) and "Total Managed Deliverables" (16) disagree — used the latter; reconcile against LBM before relying on this number.',
  },
  {
    clientMatch: 'volvi',
    label: 'Contract 2',
    startsOn: '2026-04-21',
    endsOn: '2026-07-20',
    model: 'retainer',
    cadencePerWeek: 4,
    monthlyQuota: 16,
    contractedTotal: 56, // 48 original + 8 carried over from Contract 1
    state: 'active',
    carriedIn: 8,
    notes: 'Seeded from Inventory tab.',
  },
  {
    clientMatch: 'hector',
    label: 'Contract 1',
    startsOn: '2026-02-10',
    endsOn: '2026-05-10',
    model: 'retainer',
    cadencePerWeek: 5,
    monthlyQuota: 20,
    contractedTotal: 70, // 60 short-form + 10 ads (1 body + 9 hooks)
    state: 'active',
    carriedIn: 0,
    notes: 'Seeded from Inventory tab.',
  },
  // Apex Interior omitted: no matching client row exists in production yet
  // (confirmed via allClientNames). Re-add once that client is onboarded:
  //   clientMatch: 'apex' (or whatever the client row ends up named), label:
  //   'Contract 1', startsOn: '2026-05-12', endsOn: '2026-08-12', model:
  //   'retainer', cadencePerWeek: 2, monthlyQuota: 8, contractedTotal: 25
  //   (24 short-form + 1 website), state: 'active', carriedIn: 0, notes:
  //   'Seeded from Inventory tab. Status noted as "Production Delayed –
  //   Pending Footage" in the source sheet.'
  {
    clientMatch: 'saeed',
    label: 'Contract 1',
    startsOn: '2026-02-20',
    endsOn: '2026-05-20',
    model: 'retainer',
    cadencePerWeek: 3,
    monthlyQuota: 12,
    contractedTotal: 36,
    state: 'active',
    carriedIn: 0,
    notes: 'Seeded from Inventory tab. Inventory tab (12/mo, 3x/week) conflicts with the Strategic Framework tab (8/mo, 2x/week) per contract-schema-spec.md §11.1 — this row uses Inventory; surface the conflict in the UI rather than silently picking a source.',
  },
  {
    clientMatch: 'jay', // "Jay & Kristina Rodriguez" — attached to the "Jay" client row; "Kristina" is a separate client row production has no joint-client concept for
    label: 'Package 1',
    startsOn: '2026-05-01',
    endsOn: null, // package, open-ended ("Upon Completion")
    model: 'package',
    cadencePerWeek: null,
    monthlyQuota: null, // packages have no standing monthly agreement
    contractedTotal: 40,
    state: 'active',
    carriedIn: 0,
    notes: 'Seeded from Inventory tab, "Package-Based Clients" section. Contract is jointly for Jay & Kristina Rodriguez, but production has separate "Jay" and "Kristina" client rows with no joint-client concept — attached to "Jay" only.',
  },
];

// contract_months deviation rows — the three worked examples from
// contract-schema-spec.md, matched by (clientMatch, period label).
const MONTHS: { clientMatch: string; periodLabel: string; month: string; active: boolean; quotaOverride: number | null; scopeNote: string | null; amended: boolean; note: string | null }[] = [
  {
    clientMatch: 'hector',
    periodLabel: 'Contract 1',
    month: '2026-04',
    active: true,
    quotaOverride: 30,
    scopeNote: '20 short-form + 10 ads',
    amended: true,
    note: 'Mid-term ad amendment.',
  },
  {
    clientMatch: 'volvi',
    periodLabel: 'Contract 2',
    month: '2026-04',
    active: true,
    quotaOverride: 5,
    scopeNote: null,
    amended: true,
    note: 'Contract started Apr 21 — part month.',
  },
  {
    clientMatch: 'adam',
    periodLabel: 'Contract 1',
    month: '2026-05',
    active: false,
    quotaOverride: null,
    scopeNote: null,
    amended: false,
    note: 'Contract ended Feb 15; no agreement ran in May.',
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
    const clients = clientRows as { id: string; name: string }[];

    const matched: Record<string, string> = {}; // clientMatch -> client id (first match wins)
    for (const p of PERIODS) {
      if (matched[p.clientMatch]) continue;
      const hit = clients.find(c => normalize(c.name).includes(p.clientMatch));
      if (hit) matched[p.clientMatch] = hit.id;
    }

    const unmatched = PERIODS.filter(p => !matched[p.clientMatch]).map(p => p.clientMatch);
    const periodIdByKey: Record<string, string> = {}; // `${clientMatch}::${label}` -> period id
    const inserted: string[] = [];

    const skippedExisting: string[] = [];
    for (const p of PERIODS) {
      const clientId = matched[p.clientMatch];
      if (!clientId) continue;

      const existing = await sql`
        SELECT id FROM contract_periods WHERE client_id = ${clientId} AND label = ${p.label}
      `;
      if ((existing as { id: string }[]).length > 0) {
        periodIdByKey[`${p.clientMatch}::${p.label}`] = (existing as { id: string }[])[0].id;
        skippedExisting.push(`${p.clientMatch} / ${p.label}`);
        continue;
      }

      const rows = await sql`
        INSERT INTO contract_periods
          (client_id, label, starts_on, ends_on, model, cadence_per_week, monthly_quota, contracted_total, state, carried_in, notes)
        VALUES
          (${clientId}, ${p.label}, ${p.startsOn}, ${p.endsOn}, ${p.model}, ${p.cadencePerWeek}, ${p.monthlyQuota}, ${p.contractedTotal}, ${p.state}, ${p.carriedIn}, ${p.notes})
        RETURNING id
      `;
      const id = (rows as { id: string }[])[0]?.id;
      if (id) {
        periodIdByKey[`${p.clientMatch}::${p.label}`] = id;
        inserted.push(`${p.clientMatch} / ${p.label}`);
      }
    }

    const monthsInserted: string[] = [];
    const monthsSkipped: string[] = [];
    for (const m of MONTHS) {
      const periodId = periodIdByKey[`${m.clientMatch}::${m.periodLabel}`];
      if (!periodId) { monthsSkipped.push(`${m.clientMatch} / ${m.periodLabel} / ${m.month}`); continue; }
      await sql`
        INSERT INTO contract_months (period_id, month, active, quota_override, scope_note, amended, note)
        VALUES (${periodId}, ${m.month}, ${m.active}, ${m.quotaOverride}, ${m.scopeNote}, ${m.amended}, ${m.note})
        ON CONFLICT (period_id, month) DO NOTHING
      `;
      monthsInserted.push(`${m.clientMatch} / ${m.periodLabel} / ${m.month}`);
    }

    return NextResponse.json({
      ok: true,
      periodsInserted: inserted,
      periodsSkippedExisting: skippedExisting,
      periodsUnmatchedClientNames: unmatched,
      monthsInserted,
      monthsSkippedNoPeriod: monthsSkipped,
      // Diagnostic aid for fixing clientMatch strings when names above are unmatched.
      allClientNames: unmatched.length > 0 ? clients.map(c => c.name) : undefined,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
