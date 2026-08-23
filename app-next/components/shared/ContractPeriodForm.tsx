'use client';

import { inp, fieldCap, smallBtn, smallSaveBtn } from './contractFormStyles';

export interface LineItemForm {
  deliverableType: string;
  contractedTotal: string;
  monthlyQuota: string;
  carriedIn: string;
}

export interface PeriodFormState {
  label: string;
  startsOn: string;
  endsOn: string;
  model: string;
  cadencePerWeek: string;
  monthlyQuota: string;
  contractedTotal: string;
  state: string;
  carriedIn: string;
  notes: string;
  clientIds: string[];
  lineItems: LineItemForm[];
  cycleDurationDays: string;
  dataQualityFlag: string;
  renewedFromPeriodId: string | null;
  renewedFromLabel: string | null; // display-only, for the "Renewing from" note
}

const CONTRACT_MODELS = ['retainer', 'package'] as const;
const CONTRACT_STATES = ['active', 'renewed', 'extended', 'paused', 'completed'] as const;

export function emptyPeriodFormState(lockedClientId: string): PeriodFormState {
  return {
    label: '', startsOn: '', endsOn: '', model: 'retainer', cadencePerWeek: '', monthlyQuota: '',
    contractedTotal: '', state: 'active', carriedIn: '0', notes: '',
    clientIds: [lockedClientId], lineItems: [],
    cycleDurationDays: '', dataQualityFlag: '',
    renewedFromPeriodId: null, renewedFromLabel: null,
  };
}

function emptyLineItem(): LineItemForm {
  return { deliverableType: '', contractedTotal: '', monthlyQuota: '', carriedIn: '0' };
}

function aggregateFromLineItems(items: LineItemForm[]): { contractedTotal: number; monthlyQuota: number | null } {
  const contractedTotal = items.reduce((sum, i) => sum + (Number(i.contractedTotal) || 0), 0);
  const withQuota = items.filter(i => i.monthlyQuota !== '');
  const monthlyQuota = withQuota.length > 0 ? withQuota.reduce((sum, i) => sum + (Number(i.monthlyQuota) || 0), 0) : null;
  return { contractedTotal, monthlyQuota };
}

// Create/edit form for a contract period — joint-client picker + itemized
// line-item editor on top of the original single-client, aggregate-only
// form. When at least one line item exists, the top-level contractedTotal/
// monthlyQuota fields become derived+readonly (server also recomputes them
// server-side, but showing the derived numbers here means the admin isn't
// staring at stale values they typed before adding items).
export function ContractPeriodForm({
  form, setForm, allClients, lockedClientId, saving, error, onCancel, onSave, saveLabel,
}: {
  form: PeriodFormState;
  setForm: (updater: (f: PeriodFormState) => PeriodFormState) => void;
  allClients: { id: string; name: string }[];
  lockedClientId: string;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onSave: () => void;
  saveLabel: string;
}) {
  const hasLineItems = form.lineItems.length > 0;
  const derivedAgg = hasLineItems ? aggregateFromLineItems(form.lineItems) : null;

  function toggleClient(id: string) {
    if (id === lockedClientId) return; // can't uncheck yourself out of your own drawer
    setForm(f => ({
      ...f,
      clientIds: f.clientIds.includes(id) ? f.clientIds.filter(x => x !== id) : [...f.clientIds, id],
    }));
  }

  function updateLineItem(i: number, patch: Partial<LineItemForm>) {
    setForm(f => ({ ...f, lineItems: f.lineItems.map((li, idx) => idx === i ? { ...li, ...patch } : li) }));
  }
  function removeLineItem(i: number) {
    setForm(f => ({ ...f, lineItems: f.lineItems.filter((_, idx) => idx !== i) }));
  }
  function addLineItem() {
    setForm(f => ({ ...f, lineItems: [...f.lineItems, emptyLineItem()] }));
  }

  const canSave = form.label && form.startsOn && form.clientIds.length > 0 &&
    (hasLineItems ? form.lineItems.every(li => li.deliverableType && li.contractedTotal) : !!form.contractedTotal);

  return (
    <div style={{ background: '#f4f6f8', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {form.renewedFromLabel && (
        <div style={{ fontSize: 12, fontWeight: 600, color: '#54616f', background: '#fff', border: '1px solid #d4dbe2', borderRadius: 8, padding: '6px 10px' }}>
          Renewing from &quot;{form.renewedFromLabel}&quot;
        </div>
      )}

      <div>
        <span style={fieldCap}>Label</span>
        <input aria-label="Period label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Contract 1" style={inp} />
      </div>

      <div>
        <span style={fieldCap}>Client(s)</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {allClients.map(c => {
            const checked = form.clientIds.includes(c.id);
            const locked = c.id === lockedClientId;
            return (
              <label key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '4px 9px', borderRadius: 100, border: `1px solid ${checked ? '#FF6000' : '#d4dbe2'}`, background: checked ? '#fff3ec' : '#fff', color: checked ? '#FF6000' : '#54616f', cursor: locked ? 'default' : 'pointer', opacity: locked ? 0.75 : 1 }}>
                <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggleClient(c.id)} style={{ margin: 0 }} />
                {c.name}{locked ? ' (this client)' : ''}
              </label>
            );
          })}
        </div>
        <div style={{ fontSize: 11, color: '#8b97a4', marginTop: 4 }}>Check additional clients to make this a joint contract.</div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Start date</span>
          <input aria-label="Start date" type="date" value={form.startsOn} onChange={e => setForm(f => ({ ...f, startsOn: e.target.value }))} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>End date (blank = open-ended)</span>
          <input aria-label="End date (blank = open-ended)" type="date" value={form.endsOn} onChange={e => setForm(f => ({ ...f, endsOn: e.target.value }))} style={inp} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Delivery model</span>
          <select aria-label="Delivery model" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} style={inp}>
            {CONTRACT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Contract state</span>
          <select aria-label="Contract state" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={inp}>
            {CONTRACT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Cadence / week</span>
          <input aria-label="Cadence per week" type="number" value={form.cadencePerWeek} onChange={e => setForm(f => ({ ...f, cadencePerWeek: e.target.value }))} placeholder="e.g. 4" style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Rolling cycle length (days)</span>
          <input aria-label="Rolling cycle length in days" type="number" value={form.cycleDurationDays} onChange={e => setForm(f => ({ ...f, cycleDurationDays: e.target.value }))} placeholder="Blank = fixed dates above" style={inp} />
        </div>
      </div>

      {/* Aggregate quota fields — editable directly when there's no
          itemization, derived+readonly once line items exist. */}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Monthly quota{hasLineItems ? ' (from line items)' : ''}</span>
          <input aria-label="Monthly quota" type="number" disabled={hasLineItems}
            value={hasLineItems ? (derivedAgg!.monthlyQuota ?? '') : form.monthlyQuota}
            onChange={e => setForm(f => ({ ...f, monthlyQuota: e.target.value }))}
            placeholder="e.g. 16" style={{ ...inp, ...(hasLineItems ? { background: '#eef1f4', color: '#54616f' } : {}) }} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Contracted total{hasLineItems ? ' (from line items)' : ' *'}</span>
          <input aria-label="Contracted total" type="number" disabled={hasLineItems}
            value={hasLineItems ? derivedAgg!.contractedTotal : form.contractedTotal}
            onChange={e => setForm(f => ({ ...f, contractedTotal: e.target.value }))}
            placeholder="e.g. 63" style={{ ...inp, ...(hasLineItems ? { background: '#eef1f4', color: '#54616f' } : {}) }} />
        </div>
      </div>

      {/* Per-deliverable-type line items */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={fieldCap}>Line items (optional — itemize by deliverable type)</span>
          <button type="button" onClick={addLineItem} style={{ fontSize: 11, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>+ Add type</button>
        </div>
        {form.lineItems.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.lineItems.map((li, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input aria-label="Deliverable type" value={li.deliverableType} onChange={e => updateLineItem(i, { deliverableType: e.target.value })} placeholder="short_form / youtube / ad / …" style={{ ...inp, flex: 2 }} />
                <input aria-label="Line item contracted total" type="number" value={li.contractedTotal} onChange={e => updateLineItem(i, { contractedTotal: e.target.value })} placeholder="Total" style={{ ...inp, flex: 1 }} />
                <input aria-label="Line item monthly quota" type="number" value={li.monthlyQuota} onChange={e => updateLineItem(i, { monthlyQuota: e.target.value })} placeholder="/mo" style={{ ...inp, flex: 1 }} />
                <input aria-label="Line item carried in" type="number" value={li.carriedIn} onChange={e => updateLineItem(i, { carriedIn: e.target.value })} placeholder="Carried in" style={{ ...inp, flex: 1 }} />
                <button type="button" onClick={() => removeLineItem(i)} aria-label="Remove line item" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#cf3f36', fontSize: 16, padding: '0 4px', lineHeight: 1 }}>×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Carried in (aggregate)</span>
          <input aria-label="Carried in" type="number" value={form.carriedIn} onChange={e => setForm(f => ({ ...f, carriedIn: e.target.value }))} placeholder="0" style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Data quality flag</span>
          <input aria-label="Data quality flag" value={form.dataQualityFlag} onChange={e => setForm(f => ({ ...f, dataQualityFlag: e.target.value }))} placeholder="Leave blank unless known-bad" style={inp} />
        </div>
      </div>

      <div>
        <span style={fieldCap}>Notes</span>
        <textarea aria-label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional — source of these numbers, known issues, etc." rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>

      {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={onCancel} style={smallBtn}>Cancel</button>
        <button type="button" onClick={onSave} disabled={saving || !canSave} style={smallSaveBtn(saving || !canSave)}>
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}
