// Wire shapes for a contract period and its children, as the admin APIs
// return them. Lived in components/shared/ContractPeriodCard.tsx until that
// read-view was folded into the contract drawer; they are data, not view.

export interface ContractMonthRecord {
  id: string;
  periodId: string;
  lineItemId: string | null;
  month: string;
  active: boolean;
  quotaOverride: number | null;
  scopeNote: string | null;
  amended: boolean;
  note: string | null;
}

export interface ContractLineItemRecord {
  id: string;
  periodId: string;
  deliverableType: string;
  contractedTotal: number;
  monthlyQuota: number | null;
  carriedIn: number | null;
}

export interface ContractPeriodRecord {
  id: string;
  clientId: string;
  label: string;
  startsOn: string;
  endsOn: string | null;
  model: string;
  cadencePerWeek: number | null;
  monthlyQuota: number | null;
  contractedTotal: number;
  state: string;
  carriedIn: number | null;
  notes: string | null;
  renewedFromPeriodId: string | null;
  dataQualityFlag: string | null;
  cycleDurationDays: number | null;
  cycleAnchorDate: string | null;
  months: ContractMonthRecord[];
  lineItems: ContractLineItemRecord[];
  clientIds: string[];
}
