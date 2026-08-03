'use client';

import { useState, useRef } from 'react';
import { PLATFORMS } from '@/components/dashboard/AssetInventory';

export interface ContractMonthRecord {
  id: string;
  periodId: string;
  month: string;
  active: boolean;
  quotaOverride: number | null;
  scopeNote: string | null;
  amended: boolean;
  note: string | null;
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
  months: ContractMonthRecord[];
}

export type SocialLinks = Record<string, { handle?: string; url?: string }>;

const CONTRACT_MODELS = ['retainer', 'package'] as const;
const CONTRACT_STATES = ['active', 'renewed', 'extended', 'paused', 'completed'] as const;

function emptyPeriodForm() {
  return {
    label: '', startsOn: '', endsOn: '', model: 'retainer' as string, cadencePerWeek: '', monthlyQuota: '',
    contractedTotal: '', state: 'active' as string, carriedIn: '0', notes: '',
  };
}

function emptyMonthForm() {
  return { month: '', active: true, quotaOverride: '', scopeNote: '', amended: false, note: '' };
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: 14,
  border: '1px solid #d4dbe2', borderRadius: 8,
  boxSizing: 'border-box', fontFamily: 'inherit', color: '#111c28',
  background: '#fff', outline: 'none',
};

const label: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 600, color: '#54616f',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
};

const fieldCap: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600, color: '#8b97a4',
  marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.03em',
};

const smallBtn: React.CSSProperties = {
  flex: 1, padding: '7px 12px', borderRadius: 7, fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #d4dbe2', background: '#fff', color: '#54616f',
};
function smallSaveBtn(disabled: boolean): React.CSSProperties {
  return { ...smallBtn, flex: 'unset', border: 'none', background: disabled ? '#eef1f4' : '#FF6000', color: disabled ? '#8b97a4' : '#fff' };
}
const linkBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};

// Contract periods/months + social links editor, shared between the admin
// Clients drawer and the Dashboard's Client Detail view — same underlying
// data, same API routes, so AMs get one editing surface regardless of where
// they open it from. Pass `key={clientId}` from callers so switching
// clients remounts this component and resets its internal form state
// (same convention as ClientDetail's own remount-by-key).
export function ClientEditPanel({
  clientId, periods, socialLinks, onPeriodsChange, onSocialLinksSaved,
}: {
  clientId: string;
  periods: ContractPeriodRecord[];
  socialLinks: SocialLinks | null;
  onPeriodsChange: (periods: ContractPeriodRecord[]) => void;
  onSocialLinksSaved: (links: SocialLinks) => void;
}) {
  const mutating = useRef(false);

  const [periodFormOpen, setPeriodFormOpen] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm());
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodMsg, setPeriodMsg] = useState('');
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null);

  const [monthFormPeriodId, setMonthFormPeriodId] = useState<string | null>(null);
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [monthForm, setMonthForm] = useState(emptyMonthForm());
  const [savingMonth, setSavingMonth] = useState(false);
  const [monthMsg, setMonthMsg] = useState('');

  const [socialForm, setSocialForm] = useState<Record<string, { handle: string; url: string }>>(() => {
    const init: Record<string, { handle: string; url: string }> = {};
    for (const p of PLATFORMS) {
      const entry = socialLinks?.[p.key];
      init[p.key] = { handle: entry?.handle ?? '', url: entry?.url ?? '' };
    }
    return init;
  });
  const [savingSocial, setSavingSocial] = useState(false);
  const [socialMsg, setSocialMsg] = useState('');

  function openAddPeriod() {
    setEditingPeriodId(null);
    setPeriodForm(emptyPeriodForm());
    setPeriodMsg('');
    setPeriodFormOpen(true);
  }

  function openEditPeriod(p: ContractPeriodRecord) {
    setEditingPeriodId(p.id);
    setPeriodForm({
      label: p.label, startsOn: p.startsOn, endsOn: p.endsOn ?? '', model: p.model,
      cadencePerWeek: p.cadencePerWeek?.toString() ?? '', monthlyQuota: p.monthlyQuota?.toString() ?? '',
      contractedTotal: p.contractedTotal.toString(), state: p.state, carriedIn: (p.carriedIn ?? 0).toString(),
      notes: p.notes ?? '',
    });
    setPeriodMsg('');
    setPeriodFormOpen(true);
  }

  async function savePeriod() {
    if (mutating.current) return;
    mutating.current = true;
    setSavingPeriod(true); setPeriodMsg('');
    const body = {
      clientId,
      label: periodForm.label,
      startsOn: periodForm.startsOn,
      endsOn: periodForm.endsOn || null,
      model: periodForm.model,
      cadencePerWeek: periodForm.cadencePerWeek ? Number(periodForm.cadencePerWeek) : null,
      monthlyQuota: periodForm.monthlyQuota ? Number(periodForm.monthlyQuota) : null,
      contractedTotal: Number(periodForm.contractedTotal),
      state: periodForm.state,
      carriedIn: periodForm.carriedIn ? Number(periodForm.carriedIn) : 0,
      notes: periodForm.notes || null,
    };
    try {
      const url = editingPeriodId ? `/api/admin/contracts/${editingPeriodId}` : '/api/admin/contracts';
      const res = await fetch(url, { method: editingPeriodId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const saved: ContractPeriodRecord = editingPeriodId
        ? { ...data.period, months: periods.find(p => p.id === editingPeriodId)?.months ?? [] }
        : { ...data.period, months: [] };
      const nextPeriods = editingPeriodId
        ? periods.map(p => p.id === editingPeriodId ? saved : p)
        : [...periods, saved];
      onPeriodsChange(nextPeriods);
      setPeriodFormOpen(false);
      setEditingPeriodId(null);
    } catch (e) {
      setPeriodMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setSavingPeriod(false);
    }
  }

  async function deletePeriod(p: ContractPeriodRecord) {
    if (mutating.current) return;
    if (!confirm(`Delete contract period "${p.label}"? This also deletes its monthly deviation rows. This cannot be undone.`)) return;
    mutating.current = true;
    setDeletingPeriodId(p.id);
    try {
      const res = await fetch(`/api/admin/contracts/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onPeriodsChange(periods.filter(x => x.id !== p.id));
    } catch (e) {
      setPeriodMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setDeletingPeriodId(null);
    }
  }

  function openAddMonth(periodId: string) {
    setMonthFormPeriodId(periodId);
    setEditingMonthId(null);
    setMonthForm(emptyMonthForm());
    setMonthMsg('');
  }

  function openEditMonth(periodId: string, m: ContractMonthRecord) {
    setMonthFormPeriodId(periodId);
    setEditingMonthId(m.id);
    setMonthForm({
      month: m.month, active: m.active, quotaOverride: m.quotaOverride?.toString() ?? '',
      scopeNote: m.scopeNote ?? '', amended: m.amended, note: m.note ?? '',
    });
    setMonthMsg('');
  }

  async function saveMonth(periodId: string) {
    if (mutating.current) return;
    mutating.current = true;
    setSavingMonth(true); setMonthMsg('');
    const body = {
      month: monthForm.month,
      active: monthForm.active,
      quotaOverride: monthForm.quotaOverride ? Number(monthForm.quotaOverride) : null,
      scopeNote: monthForm.scopeNote || null,
      amended: monthForm.amended,
      note: monthForm.note || null,
    };
    try {
      const url = editingMonthId ? `/api/admin/contracts/months/${editingMonthId}` : `/api/admin/contracts/${periodId}/months`;
      const res = await fetch(url, { method: editingMonthId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const saved: ContractMonthRecord = data.month;
      const nextPeriods = periods.map(p => {
        if (p.id !== periodId) return p;
        const nextMonths = editingMonthId ? p.months.map(m => m.id === editingMonthId ? saved : m) : [...p.months, saved];
        return { ...p, months: nextMonths };
      });
      onPeriodsChange(nextPeriods);
      setMonthFormPeriodId(null);
      setEditingMonthId(null);
    } catch (e) {
      setMonthMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setSavingMonth(false);
    }
  }

  async function deleteMonth(periodId: string, m: ContractMonthRecord) {
    if (mutating.current) return;
    if (!confirm(`Delete the ${m.month} deviation row? This cannot be undone.`)) return;
    mutating.current = true;
    try {
      const res = await fetch(`/api/admin/contracts/months/${m.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onPeriodsChange(periods.map(p => p.id === periodId ? { ...p, months: p.months.filter(x => x.id !== m.id) } : p));
    } catch (e) {
      setMonthMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
    }
  }

  async function saveSocialLinks() {
    if (mutating.current) return;
    mutating.current = true;
    setSavingSocial(true); setSocialMsg('');
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/social-links`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ socialLinks: socialForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onSocialLinksSaved(data.socialLinks ?? {});
      setSocialMsg('Saved.');
    } catch (e) {
      setSocialMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setSavingSocial(false);
    }
  }

  const periodFormJsx = (
    <div style={{ background: '#f4f6f8', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        <span style={fieldCap}>Label</span>
        <input aria-label="Period label" value={periodForm.label} onChange={e => setPeriodForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Contract 1" style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Start date</span>
          <input aria-label="Start date" type="date" value={periodForm.startsOn} onChange={e => setPeriodForm(f => ({ ...f, startsOn: e.target.value }))} style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>End date (blank = open-ended)</span>
          <input aria-label="End date (blank = open-ended)" type="date" value={periodForm.endsOn} onChange={e => setPeriodForm(f => ({ ...f, endsOn: e.target.value }))} style={inp} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Delivery model</span>
          <select aria-label="Delivery model" value={periodForm.model} onChange={e => setPeriodForm(f => ({ ...f, model: e.target.value }))} style={inp}>
            {CONTRACT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Contract state</span>
          <select aria-label="Contract state" value={periodForm.state} onChange={e => setPeriodForm(f => ({ ...f, state: e.target.value }))} style={inp}>
            {CONTRACT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Cadence / week</span>
          <input aria-label="Cadence per week" type="number" value={periodForm.cadencePerWeek} onChange={e => setPeriodForm(f => ({ ...f, cadencePerWeek: e.target.value }))} placeholder="e.g. 4" style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Monthly quota</span>
          <input aria-label="Monthly quota" type="number" value={periodForm.monthlyQuota} onChange={e => setPeriodForm(f => ({ ...f, monthlyQuota: e.target.value }))} placeholder="e.g. 16" style={inp} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Contracted total *</span>
          <input aria-label="Contracted total" type="number" value={periodForm.contractedTotal} onChange={e => setPeriodForm(f => ({ ...f, contractedTotal: e.target.value }))} placeholder="e.g. 63" style={inp} />
        </div>
        <div style={{ flex: 1 }}>
          <span style={fieldCap}>Carried in</span>
          <input aria-label="Carried in" type="number" value={periodForm.carriedIn} onChange={e => setPeriodForm(f => ({ ...f, carriedIn: e.target.value }))} placeholder="0" style={inp} />
        </div>
      </div>
      <div>
        <span style={fieldCap}>Notes</span>
        <textarea aria-label="Notes" value={periodForm.notes} onChange={e => setPeriodForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional — source of these numbers, known issues, etc." rows={2} style={{ ...inp, resize: 'vertical' }} />
      </div>
      {periodMsg && <div style={{ fontSize: 12, color: '#cf3f36' }}>{periodMsg}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => { setPeriodFormOpen(false); setEditingPeriodId(null); }} style={smallBtn}>Cancel</button>
        <button type="button" onClick={savePeriod} disabled={savingPeriod || !periodForm.label || !periodForm.startsOn || !periodForm.contractedTotal} style={smallSaveBtn(savingPeriod || !periodForm.label || !periodForm.startsOn || !periodForm.contractedTotal)}>
          {savingPeriod ? 'Saving…' : editingPeriodId ? 'Save changes' : 'Add period'}
        </button>
      </div>
    </div>
  );

  function renderMonthForm(periodId: string) {
    return (
      <div style={{ background: '#fff', border: '1px dashed #d4dbe2', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <span style={fieldCap}>Month</span>
          <input aria-label="Month" type="month" value={monthForm.month} onChange={e => setMonthForm(f => ({ ...f, month: e.target.value }))} style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <span style={fieldCap}>Quota override</span>
            <input aria-label="Quota override" type="number" value={monthForm.quotaOverride} onChange={e => setMonthForm(f => ({ ...f, quotaOverride: e.target.value }))} placeholder="Blank = use standing quota" style={inp} />
          </div>
          <div style={{ flex: 1 }}>
            <span style={fieldCap}>Scope note</span>
            <input aria-label="Scope note" value={monthForm.scopeNote} onChange={e => setMonthForm(f => ({ ...f, scopeNote: e.target.value }))} placeholder="e.g. 20 short-form + 10 ads" style={inp} />
          </div>
        </div>
        <div>
          <span style={fieldCap}>Note</span>
          <input aria-label="Note" value={monthForm.note} onChange={e => setMonthForm(f => ({ ...f, note: e.target.value }))} placeholder="Why this month deviates" style={inp} />
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#54616f', cursor: 'pointer' }}>
            <input type="checkbox" checked={monthForm.active} onChange={e => setMonthForm(f => ({ ...f, active: e.target.checked }))} /> Active
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#54616f', cursor: 'pointer' }}>
            <input type="checkbox" checked={monthForm.amended} onChange={e => setMonthForm(f => ({ ...f, amended: e.target.checked }))} /> Amended
          </label>
        </div>
        {monthMsg && <div style={{ fontSize: 12, color: '#cf3f36' }}>{monthMsg}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => { setMonthFormPeriodId(null); setEditingMonthId(null); }} style={smallBtn}>Cancel</button>
          <button type="button" onClick={() => saveMonth(periodId)} disabled={savingMonth || !monthForm.month} style={smallSaveBtn(savingMonth || !monthForm.month)}>
            {savingMonth ? 'Saving…' : editingMonthId ? 'Save' : 'Add'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Contracts */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={label}>Contracts</span>
          {!(periodFormOpen && editingPeriodId === null) && (
            <button type="button" onClick={openAddPeriod} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><path d="M12 5v14M5 12h14" /></svg>
              Add contract period
            </button>
          )}
        </div>

        {periodFormOpen && editingPeriodId === null && <div style={{ marginBottom: 12 }}>{periodFormJsx}</div>}

        {periods.length === 0 && !periodFormOpen ? (
          <div style={{ fontSize: 13, color: '#8b97a4', fontStyle: 'italic' }}>No contract periods yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periods.map(p => (
              <div key={p.id} style={{ background: '#f4f6f8', borderRadius: 10, padding: 12 }}>
                {periodFormOpen && editingPeriodId === p.id ? periodFormJsx : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: '#111c28' }}>{p.label}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 100, color: '#54616f', background: '#e7ebef', textTransform: 'capitalize' }}>{p.state}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#54616f', marginTop: 4 }}>
                      {p.startsOn} → {p.endsOn ?? 'open-ended'} · {p.model}{p.cadencePerWeek ? ` · ${p.cadencePerWeek}x/week` : ''}
                    </div>
                    <div style={{ fontSize: 12, color: '#54616f', marginTop: 2 }}>
                      {p.monthlyQuota != null ? `${p.monthlyQuota}/mo` : 'no standing quota'} · {p.contractedTotal} contracted{p.carriedIn ? ` (+${p.carriedIn} carried in)` : ''}
                    </div>
                    {p.notes && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>{p.notes}</div>}
                    <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
                      <button type="button" onClick={() => openEditPeriod(p)} style={linkBtn}>Edit</button>
                      <button type="button" onClick={() => deletePeriod(p)} disabled={deletingPeriodId === p.id} style={{ ...linkBtn, color: '#cf3f36' }}>{deletingPeriodId === p.id ? 'Deleting…' : 'Delete'}</button>
                      {!(monthFormPeriodId === p.id && editingMonthId === null) && (
                        <button type="button" onClick={() => openAddMonth(p.id)} style={linkBtn}>+ Month deviation</button>
                      )}
                    </div>

                    {(p.months.length > 0 || (monthFormPeriodId === p.id && editingMonthId === null)) && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {p.months.map(m => (
                          monthFormPeriodId === p.id && editingMonthId === m.id ? (
                            <div key={m.id}>{renderMonthForm(p.id)}</div>
                          ) : (
                            <div key={m.id} style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 8, padding: 8, fontSize: 12 }}>
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ fontWeight: 600, color: '#111c28' }}>{m.month}{!m.active ? ' · inactive' : ''}{m.amended ? ' · amended' : ''}</span>
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button type="button" onClick={() => openEditMonth(p.id, m)} style={linkBtn}>Edit</button>
                                  <button type="button" onClick={() => deleteMonth(p.id, m)} style={{ ...linkBtn, color: '#cf3f36' }}>Delete</button>
                                </div>
                              </div>
                              {m.quotaOverride != null && <div style={{ color: '#54616f', marginTop: 2 }}>Quota override: {m.quotaOverride}</div>}
                              {m.scopeNote && <div style={{ color: '#54616f', marginTop: 2 }}>{m.scopeNote}</div>}
                              {m.note && <div style={{ color: '#8b97a4', marginTop: 2 }}>{m.note}</div>}
                            </div>
                          )
                        ))}
                        {monthFormPeriodId === p.id && editingMonthId === null && renderMonthForm(p.id)}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: '1px solid #e7ebef' }} />

      {/* Social & platform links */}
      <div>
        <span style={label}>Social & platform links</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          {PLATFORMS.map(p => (
            <div key={p.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ width: 66, fontSize: 12, fontWeight: 600, color: '#54616f', flexShrink: 0 }}>{p.label}</span>
              <input
                aria-label={`${p.label} handle`}
                value={socialForm[p.key]?.handle ?? ''}
                onChange={e => setSocialForm(f => ({ ...f, [p.key]: { handle: e.target.value, url: f[p.key]?.url ?? '' } }))}
                placeholder="Handle"
                style={{ ...inp, flex: 1 }}
              />
              <input
                aria-label={`${p.label} URL`}
                value={socialForm[p.key]?.url ?? ''}
                onChange={e => setSocialForm(f => ({ ...f, [p.key]: { handle: f[p.key]?.handle ?? '', url: e.target.value } }))}
                placeholder="URL"
                style={{ ...inp, flex: 1 }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <button type="button" onClick={saveSocialLinks} disabled={savingSocial} style={smallSaveBtn(savingSocial)}>
            {savingSocial ? 'Saving…' : 'Save social links'}
          </button>
          {socialMsg && <span style={{ fontSize: 12, color: socialMsg === 'Saved.' ? '#14805f' : '#cf3f36' }}>{socialMsg}</span>}
        </div>
      </div>
    </div>
  );
}
