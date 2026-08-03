import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clients as clientsTable, contractPeriods, contractMonths } from '@/lib/db/schema';
import { getDashboardTasks } from '@/lib/dashboard-tasks';
import { resolveMonthAgreement } from '@/lib/contracts';

function norm(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
function parseDate(s: string) {
  const n = Number(s);
  return isNaN(n) ? new Date(s).getTime() : n;
}

export type MonthOutcome = 'below' | 'met' | 'not-reported' | 'no-contract' | 'package-not-monthly' | 'no-agreement-on-file';

export interface MonthModeRow {
  id: string;
  name: string;
  subtitle: string;
  type: 'retainer' | 'package' | 'none';
  outcome: MonthOutcome;
  amended: boolean;
  agreementText: string;
  delivered: number;
  quota: number | null;
  shortfallNote: string | null;
}

export interface MonthModeResponse {
  month: string;
  rows: MonthModeRow[];
  kpis: { contractsRunning: number; belowAgreement: number; amendedAgreements: number; notReported: number };
}

export async function GET(req: Request) {
  const month = new URL(req.url).searchParams.get('month'); // 'YYYY-MM'
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });

  const [y, m] = month.split('-').map(Number);
  const monthStart = new Date(Date.UTC(y, m - 1, 1)).getTime();
  const monthEnd = new Date(Date.UTC(y, m, 0)).getTime();

  const [allClients, allPeriods, monthRows, { tasks: allTasks }] = await Promise.all([
    db.select({ id: clientsTable.id, name: clientsTable.name }).from(clientsTable),
    db.select().from(contractPeriods),
    db.select().from(contractMonths).where(eq(contractMonths.month, month)),
    getDashboardTasks(),
  ]);

  const monthRowByPeriod = new Map(monthRows.map(r => [r.periodId, r]));

  const rows: MonthModeRow[] = allClients.map(client => {
    // The period covering this month, if any; a client with several periods
    // over time has at most one that overlaps a given month in practice.
    const candidates = allPeriods.filter(p => p.clientId === client.id);
    const covering = candidates.find(p => {
      const starts = new Date(p.startsOn).getTime();
      const ends = p.endsOn ? new Date(p.endsOn).getTime() : Infinity;
      return starts <= monthEnd && ends >= monthStart;
    });

    const clientTasks = allTasks.filter(t => norm(t.clientName ?? '') === norm(client.name));
    const delivered = clientTasks.filter(t =>
      norm(t.status) === 'posted in socials' &&
      parseDate(t.dateUpdated) >= monthStart && parseDate(t.dateUpdated) <= monthEnd
    ).length;

    // A real package client (§5.3): distinct from "no contract on file" even
    // when their package period doesn't technically span this exact month.
    const anyPackagePeriod = candidates.find(p => p.model === 'package');
    if (!covering || covering.model === 'package') {
      if (anyPackagePeriod) {
        return { id: `pkg-${client.id}`, name: client.name, subtitle: 'Package — not monthly', type: 'package', outcome: 'package-not-monthly', amended: false, agreementText: 'Package (not a monthly agreement)', delivered, quota: null, shortfallNote: null };
      }
      if (candidates.length === 0) {
        return { id: `none-${client.id}`, name: client.name, subtitle: 'No contract on file', type: 'none', outcome: 'no-agreement-on-file', amended: false, agreementText: 'No monthly agreement on file', delivered, quota: null, shortfallNote: null };
      }
      return { id: `nc-${client.id}`, name: client.name, subtitle: candidates[0]?.label ?? '', type: candidates[0]?.model === 'package' ? 'package' : 'retainer', outcome: 'no-contract', amended: false, agreementText: 'No contract that month', delivered, quota: null, shortfallNote: null };
    }

    const monthRow = monthRowByPeriod.get(covering.id) ?? null;
    const agreement = resolveMonthAgreement(covering, monthRow, month);

    if (agreement.kind === 'none') {
      return { id: `paused-${covering.id}`, name: client.name, subtitle: covering.label, type: 'retainer', outcome: 'no-contract', amended: false, agreementText: 'Not running this month', delivered, quota: null, shortfallNote: null };
    }

    const quota = agreement.quota;
    const scopeText = agreement.scopeNote ?? (agreement.kind === 'part' ? `part month — ${agreement.daysUnderContract} of ${agreement.daysInMonth} days under contract` : `${quota}/mo`);
    let outcome: MonthOutcome;
    let shortfallNote: string | null = null;
    if (delivered === 0) {
      outcome = 'not-reported';
    } else if (delivered < quota) {
      outcome = 'below';
      shortfallNote = `${quota - delivered} short of the ${quota} agreed`;
    } else {
      outcome = 'met';
    }

    return {
      id: covering.id,
      name: client.name,
      subtitle: covering.label,
      type: 'retainer',
      outcome,
      amended: agreement.amended,
      agreementText: scopeText,
      delivered,
      quota,
      shortfallNote,
    };
  });

  const kpis = {
    contractsRunning: rows.filter(r => r.quota !== null || r.outcome === 'not-reported' || r.outcome === 'below' || r.outcome === 'met').length,
    belowAgreement: rows.filter(r => r.outcome === 'below').length,
    amendedAgreements: rows.filter(r => r.amended).length,
    notReported: rows.filter(r => r.outcome === 'not-reported').length,
  };

  const response: MonthModeResponse = { month, rows, kpis };
  return NextResponse.json(response);
}
