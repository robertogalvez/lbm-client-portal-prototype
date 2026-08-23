'use client';

import { useState, useRef, useEffect } from 'react';
import { PLATFORMS } from '@/components/dashboard/AssetInventory';
import { inp, label, fieldCap, smallBtn, smallSaveBtn, linkBtn } from './contractFormStyles';
import { ContractPeriodCard, type ContractPeriodRecord, type ContractMonthRecord, type ContractLineItemRecord } from './ContractPeriodCard';
import { ContractPeriodForm, emptyPeriodFormState, type PeriodFormState } from './ContractPeriodForm';
import { resolveCurrentPeriod } from '@/lib/contracts';

// Re-exported for the existing callers (ClientsPageClient, ClientDetail,
// client-detail/route.ts) that import these types from this file.
export type { ContractPeriodRecord, ContractMonthRecord, ContractLineItemRecord };

export type SocialLinks = Record<string, { handle?: string; url?: string }>;

function emptyMonthForm() {
  return { month: '', active: true, quotaOverride: '', scopeNote: '', amended: false, note: '', lineItemId: '' };
}

function periodToFormState(p: ContractPeriodRecord): PeriodFormState {
  return {
    label: p.label, startsOn: p.startsOn, endsOn: p.endsOn ?? '', model: p.model,
    cadencePerWeek: p.cadencePerWeek?.toString() ?? '', monthlyQuota: p.monthlyQuota?.toString() ?? '',
    contractedTotal: p.contractedTotal.toString(), state: p.state, carriedIn: (p.carriedIn ?? 0).toString(),
    notes: p.notes ?? '', clientIds: p.clientIds.length > 0 ? p.clientIds : [p.clientId],
    lineItems: p.lineItems.map(li => ({
      deliverableType: li.deliverableType, contractedTotal: li.contractedTotal.toString(),
      monthlyQuota: li.monthlyQuota?.toString() ?? '', carriedIn: (li.carriedIn ?? 0).toString(),
    })),
    cycleDurationDays: p.cycleDurationDays?.toString() ?? '', dataQualityFlag: p.dataQualityFlag ?? '',
    renewedFromPeriodId: p.renewedFromPeriodId, renewedFromLabel: null,
  };
}

function formStateToBody(clientId: string, form: PeriodFormState) {
  return {
    clientIds: form.clientIds,
    label: form.label,
    startsOn: form.startsOn,
    endsOn: form.endsOn || null,
    model: form.model,
    cadencePerWeek: form.cadencePerWeek ? Number(form.cadencePerWeek) : null,
    monthlyQuota: form.monthlyQuota ? Number(form.monthlyQuota) : null,
    contractedTotal: form.contractedTotal ? Number(form.contractedTotal) : undefined,
    state: form.state,
    carriedIn: form.carriedIn ? Number(form.carriedIn) : 0,
    notes: form.notes || null,
    lineItems: form.lineItems
      .filter(li => li.deliverableType && li.contractedTotal)
      .map(li => ({
        deliverableType: li.deliverableType,
        contractedTotal: Number(li.contractedTotal),
        monthlyQuota: li.monthlyQuota ? Number(li.monthlyQuota) : null,
        carriedIn: li.carriedIn ? Number(li.carriedIn) : 0,
      })),
    cycleDurationDays: form.cycleDurationDays ? Number(form.cycleDurationDays) : null,
    dataQualityFlag: form.dataQualityFlag || null,
    renewedFromPeriodId: form.renewedFromPeriodId || null,
  };
}

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

  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    fetch('/api/admin/contracts/clients-roster').then(r => r.ok ? r.json() : []).then(setAllClients).catch(() => {});
  }, []);
  const clientName = (id: string) => allClients.find(c => c.id === id)?.name ?? '…';

  const [periodFormOpen, setPeriodFormOpen] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState<PeriodFormState>(() => emptyPeriodFormState(clientId));
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodMsg, setPeriodMsg] = useState('');
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null);
  const [renewLoadingId, setRenewLoadingId] = useState<string | null>(null);

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

  const currentPeriod = resolveCurrentPeriod(periods, new Date());

  function openAddPeriod() {
    setEditingPeriodId(null);
    setPeriodForm(emptyPeriodFormState(clientId));
    setPeriodMsg('');
    setPeriodFormOpen(true);
  }

  function openEditPeriod(p: ContractPeriodRecord) {
    setEditingPeriodId(p.id);
    setPeriodForm(periodToFormState(p));
    setPeriodMsg('');
    setPeriodFormOpen(true);
  }

  async function openRenew(p: ContractPeriodRecord) {
    if (renewLoadingId) return;
    setRenewLoadingId(p.id);
    try {
      const res = await fetch(`/api/admin/contracts/${p.id}/renewal-preview`);
      const preview = await res.json();
      if (!res.ok) throw new Error(preview.error ?? 'Failed to compute renewal preview');
      const base = periodToFormState(p);
      setEditingPeriodId(null);
      setPeriodForm({
        ...base,
        startsOn: preview.suggestedStartsOn ?? base.startsOn,
        endsOn: '',
        state: 'active',
        carriedIn: String(preview.carriedIn ?? 0),
        lineItems: base.lineItems.map(li => {
          const match = (preview.lineItems ?? []).find((pl: { deliverableType: string; suggestedCarriedIn: number }) => pl.deliverableType === li.deliverableType);
          return match ? { ...li, carriedIn: String(match.suggestedCarriedIn) } : li;
        }),
        clientIds: preview.clientIds ?? base.clientIds,
        cycleDurationDays: preview.cycleDurationDays != null ? String(preview.cycleDurationDays) : base.cycleDurationDays,
        renewedFromPeriodId: p.id,
        renewedFromLabel: p.label,
        dataQualityFlag: '', // a renewal starts clean — doesn't inherit the predecessor's flag
      });
      setPeriodMsg('');
      setPeriodFormOpen(true);
    } catch (e) {
      setPeriodMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setRenewLoadingId(null);
    }
  }

  async function savePeriod() {
    if (mutating.current) return;
    mutating.current = true;
    setSavingPeriod(true); setPeriodMsg('');
    const body = formStateToBody(clientId, periodForm);
    try {
      const url = editingPeriodId ? `/api/admin/contracts/${editingPeriodId}` : '/api/admin/contracts';
      const res = await fetch(url, { method: editingPeriodId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const savedLineItems: ContractLineItemRecord[] = (data.lineItems ?? []).map((li: { deliverableType: string; contractedTotal: number; monthlyQuota: number | null; carriedIn: number | null }, i: number) => ({
        id: `${data.period.id}-li-${i}`, periodId: data.period.id, ...li,
      }));
      const saved: ContractPeriodRecord = {
        ...data.period,
        clientIds: data.clientIds ?? [clientId],
        lineItems: savedLineItems,
        months: editingPeriodId ? periods.find(p => p.id === editingPeriodId)?.months ?? [] : [],
      };
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
    if (!confirm(`Delete contract period "${p.label}"? This also deletes its monthly deviation rows and line items. This cannot be undone.`)) return;
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
      scopeNote: m.scopeNote ?? '', amended: m.amended, note: m.note ?? '', lineItemId: m.lineItemId ?? '',
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
      lineItemId: monthForm.lineItemId || null,
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

  function renderMonthForm(periodId: string, lineItems: ContractLineItemRecord[]) {
    return (
      <div style={{ background: '#fff', border: '1px dashed #d4dbe2', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lineItems.length > 0 && (
          <div>
            <span style={fieldCap}>Applies to</span>
            <select aria-label="Applies to" value={monthForm.lineItemId} onChange={e => setMonthForm(f => ({ ...f, lineItemId: e.target.value }))} style={inp}>
              <option value="">Whole contract</option>
              {lineItems.map(li => <option key={li.id} value={li.id}>{li.deliverableType}</option>)}
            </select>
          </div>
        )}
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

        {periodFormOpen && editingPeriodId === null && (
          <div style={{ marginBottom: 12 }}>
            <ContractPeriodForm
              form={periodForm} setForm={setPeriodForm} allClients={allClients} lockedClientId={clientId}
              saving={savingPeriod} error={periodMsg} onCancel={() => { setPeriodFormOpen(false); setEditingPeriodId(null); }}
              onSave={savePeriod} saveLabel={periodForm.renewedFromPeriodId ? 'Create renewal' : 'Add period'}
            />
          </div>
        )}

        {periods.length === 0 && !periodFormOpen ? (
          <div style={{ fontSize: 13, color: '#8b97a4', fontStyle: 'italic' }}>No contract periods yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periods.map(p => (
              periodFormOpen && editingPeriodId === p.id ? (
                <div key={p.id}>
                  <ContractPeriodForm
                    form={periodForm} setForm={setPeriodForm} allClients={allClients} lockedClientId={clientId}
                    saving={savingPeriod} error={periodMsg} onCancel={() => { setPeriodFormOpen(false); setEditingPeriodId(null); }}
                    onSave={savePeriod} saveLabel="Save changes"
                  />
                </div>
              ) : (
                <ContractPeriodCard
                  key={p.id}
                  period={p}
                  clientNames={p.clientIds.length > 0 ? p.clientIds.map(clientName) : [clientName(p.clientId)]}
                  isCurrent={currentPeriod?.id === p.id}
                  deleting={deletingPeriodId === p.id}
                  onEdit={() => openEditPeriod(p)}
                  onDelete={() => deletePeriod(p)}
                  onRenew={() => openRenew(p)}
                  monthsSection={
                    <>
                      {!(monthFormPeriodId === p.id && editingMonthId === null) && (
                        <div style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => openAddMonth(p.id)} style={linkBtn}>+ Month deviation</button>
                        </div>
                      )}
                      {(p.months.length > 0 || (monthFormPeriodId === p.id && editingMonthId === null)) && (
                        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {p.months.map(m => (
                            monthFormPeriodId === p.id && editingMonthId === m.id ? (
                              <div key={m.id}>{renderMonthForm(p.id, p.lineItems)}</div>
                            ) : (
                              <div key={m.id} style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 8, padding: 8, fontSize: 12 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <span style={{ fontWeight: 600, color: '#111c28' }}>
                                    {m.month}{!m.active ? ' · inactive' : ''}{m.amended ? ' · amended' : ''}
                                    {m.lineItemId ? ` · ${p.lineItems.find(li => li.id === m.lineItemId)?.deliverableType ?? 'line item'}` : ''}
                                  </span>
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
                          {monthFormPeriodId === p.id && editingMonthId === null && renderMonthForm(p.id, p.lineItems)}
                        </div>
                      )}
                    </>
                  }
                />
              )
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
