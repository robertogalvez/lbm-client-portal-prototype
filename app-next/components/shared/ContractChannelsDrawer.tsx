'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { T, MONO } from '@/components/ui/tokens';
import { PLATFORMS, handleFromUrl, type SocialLinks } from '@/lib/socialLinks';
import { resolveCurrentPeriod } from '@/lib/contracts';
import type { ContractPeriodRecord, ContractMonthRecord, ContractLineItemRecord } from '@/lib/contract-records';
import { inp, fieldCap, linkBtn } from './contractFormStyles';

/**
 * Screen 4 — one drawer for a client's contract and channels, with one save
 * for the whole panel.
 *
 * What the old form did and this one doesn't: a 13-checkbox joint-client
 * picker as the tallest element on screen (now a collapsed disclosure), four
 * overlapping quantity fields with no rule for which to fill (now one field,
 * chosen by the delivery model), a contract-state dropdown (derived from the
 * dates, and a source of contradictions), an internal data-quality flag in a
 * user-facing form, line items by deliverable type that nothing consumed, and
 * a separate "Save social links" button that allowed half-saved state.
 *
 * None of those columns were dropped from the schema or the API — this form
 * simply stops editing them, and passes the stored values straight back
 * through on save so nothing is destroyed.
 */

interface PeriodForm {
  label: string;
  startsOn: string;
  endsOn: string;
  model: 'retainer' | 'package';
  monthlyQuota: string;
  contractedTotal: string;
  notes: string;
  clientIds: string[];
  cadencePerWeek: string;
  cycleDurationDays: string;
  carriedIn: string;
  renewedFromPeriodId: string | null;
  renewedFromLabel: string | null;
}

interface ChannelRow { key: string; url: string }

function emptyForm(clientId: string): PeriodForm {
  return {
    label: '', startsOn: '', endsOn: '', model: 'retainer',
    monthlyQuota: '', contractedTotal: '', notes: '', clientIds: [clientId],
    cadencePerWeek: '', cycleDurationDays: '', carriedIn: '0',
    renewedFromPeriodId: null, renewedFromLabel: null,
  };
}

function periodToForm(p: ContractPeriodRecord): PeriodForm {
  return {
    label: p.label,
    startsOn: p.startsOn,
    endsOn: p.endsOn ?? '',
    model: p.model === 'package' ? 'package' : 'retainer',
    monthlyQuota: p.monthlyQuota?.toString() ?? '',
    contractedTotal: p.contractedTotal.toString(),
    notes: p.notes ?? '',
    clientIds: p.clientIds.length > 0 ? p.clientIds : [p.clientId],
    cadencePerWeek: p.cadencePerWeek?.toString() ?? '',
    cycleDurationDays: p.cycleDurationDays?.toString() ?? '',
    carriedIn: (p.carriedIn ?? 0).toString(),
    renewedFromPeriodId: p.renewedFromPeriodId,
    renewedFromLabel: null,
  };
}

/**
 * `existing` is the period being edited, when there is one: its line items,
 * data-quality flag and state ride along untouched so editing the term can
 * never silently drop them.
 */
function formToBody(form: PeriodForm, existing: ContractPeriodRecord | null) {
  return {
    clientIds: form.clientIds,
    label: form.label,
    startsOn: form.startsOn,
    endsOn: form.endsOn || null,
    model: form.model,
    cadencePerWeek: form.cadencePerWeek ? Number(form.cadencePerWeek) : null,
    monthlyQuota: form.model === 'retainer' && form.monthlyQuota ? Number(form.monthlyQuota) : null,
    contractedTotal: form.contractedTotal ? Number(form.contractedTotal) : undefined,
    // Derived from the dates by resolveCurrentPeriod/expiryLabel — a stored
    // state that disagreed with them was one of the portal's contradictions.
    state: existing?.state ?? 'active',
    carriedIn: form.carriedIn ? Number(form.carriedIn) : 0,
    notes: form.notes || null,
    lineItems: (existing?.lineItems ?? []).map(li => ({
      deliverableType: li.deliverableType,
      contractedTotal: li.contractedTotal,
      monthlyQuota: li.monthlyQuota,
      carriedIn: li.carriedIn ?? 0,
    })),
    cycleDurationDays: form.cycleDurationDays ? Number(form.cycleDurationDays) : null,
    dataQualityFlag: existing?.dataQualityFlag ?? null,
    renewedFromPeriodId: form.renewedFromPeriodId || null,
  };
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function Disclosure({ label, open, onToggle, children }: { label: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: T.ink2 }}
      >
        <span aria-hidden style={{ fontSize: 10, color: T.ink3 }}>{open ? '▲' : '▼'}</span>
        {label}
      </button>
      {open && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>{children}</div>}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  periods: ContractPeriodRecord[];
  socialLinks: SocialLinks | null;
  /** Called after a successful save so the caller can refresh its data. */
  onSaved: (periods: ContractPeriodRecord[], links: SocialLinks) => void;
}

export function ContractChannelsDrawer({ open, onClose, clientId, clientName, periods: initialPeriods, socialLinks, onSaved }: Props) {
  const mutating = useRef(false);
  // Callers mount this only while it is open, so the local copy always
  // starts from fresh props — no prop→state resync effect needed.
  const [periods, setPeriods] = useState(initialPeriods);

  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (!open) return;
    fetch('/api/admin/contracts/clients-roster').then(r => r.ok ? r.json() : []).then(setRoster).catch(() => {});
  }, [open]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PeriodForm>(() => emptyForm(clientId));
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [jointOpen, setJointOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [monthPeriodId, setMonthPeriodId] = useState<string | null>(null);
  const [monthForm, setMonthForm] = useState({ month: '', quotaOverride: '', note: '' });

  const [channels, setChannels] = useState<ChannelRow[]>(() =>
    PLATFORMS.filter(p => socialLinks?.[p.key]?.url || socialLinks?.[p.key]?.handle)
      .map(p => ({ key: p.key, url: socialLinks?.[p.key]?.url ?? '' })));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const editing = editingId ? periods.find(p => p.id === editingId) ?? null : null;
  const current = resolveCurrentPeriod(periods, new Date());
  const unusedPlatforms = useMemo(
    () => PLATFORMS.filter(p => !channels.some(c => c.key === p.key)),
    [channels],
  );

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm(clientId));
    setFormOpen(true);
    setError('');
  }

  function openEdit(p: ContractPeriodRecord) {
    setEditingId(p.id);
    setForm(periodToForm(p));
    setFormOpen(true);
    setMenuOpenId(null);
    setError('');
  }

  async function openRenew(p: ContractPeriodRecord) {
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/admin/contracts/${p.id}/renewal-preview`);
      const preview = await res.json();
      if (!res.ok) throw new Error(preview.error ?? 'Failed to compute renewal preview');
      const base = periodToForm(p);
      setEditingId(null);
      setForm({
        ...base,
        startsOn: preview.suggestedStartsOn ?? base.startsOn,
        endsOn: '',
        carriedIn: String(preview.carriedIn ?? 0),
        clientIds: preview.clientIds ?? base.clientIds,
        cycleDurationDays: preview.cycleDurationDays != null ? String(preview.cycleDurationDays) : base.cycleDurationDays,
        renewedFromPeriodId: p.id,
        renewedFromLabel: p.label,
      });
      setFormOpen(true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  async function deletePeriod(p: ContractPeriodRecord) {
    if (mutating.current) return;
    if (!confirm(`Delete contract period "${p.label}"? This also deletes its monthly deviation rows and line items. This cannot be undone.`)) return;
    mutating.current = true;
    setMenuOpenId(null);
    try {
      const res = await fetch(`/api/admin/contracts/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setPeriods(prev => prev.filter(x => x.id !== p.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
    }
  }

  async function saveMonth(periodId: string) {
    if (!monthForm.month) return;
    try {
      const res = await fetch(`/api/admin/contracts/${periodId}/months`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: monthForm.month,
          active: true,
          quotaOverride: monthForm.quotaOverride ? Number(monthForm.quotaOverride) : null,
          scopeNote: null,
          amended: true,
          note: monthForm.note || null,
          lineItemId: null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const saved: ContractMonthRecord = data.month;
      setPeriods(prev => prev.map(p => p.id === periodId ? { ...p, months: [...p.months, saved] } : p));
      setMonthPeriodId(null);
      setMonthForm({ month: '', quotaOverride: '', note: '' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }

  const quantityValid = form.model === 'retainer' ? !!form.monthlyQuota || !!form.contractedTotal : !!form.contractedTotal;
  const canSave = !formOpen || (!!form.label && !!form.startsOn && form.clientIds.length > 0 && quantityValid);

  // One save for the entire drawer: the contract period (when the form is
  // open) and the channels go together, so the panel can never be left half
  // applied the way the old separate "Save social links" button allowed.
  async function saveAll() {
    if (mutating.current || !canSave) return;
    mutating.current = true;
    setSaving(true);
    setError('');
    try {
      let nextPeriods = periods;

      if (formOpen) {
        const body = formToBody(form, editing);
        const res = await fetch(editingId ? `/api/admin/contracts/${editingId}` : '/api/admin/contracts', {
          method: editingId ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed to save the contract period');
        const savedLineItems: ContractLineItemRecord[] = (data.lineItems ?? []).map(
          (li: Omit<ContractLineItemRecord, 'id' | 'periodId'>, i: number) => ({ id: `${data.period.id}-li-${i}`, periodId: data.period.id, ...li }),
        );
        const saved: ContractPeriodRecord = {
          ...data.period,
          clientIds: data.clientIds ?? [clientId],
          lineItems: savedLineItems,
          months: editingId ? periods.find(p => p.id === editingId)?.months ?? [] : [],
        };
        nextPeriods = editingId ? periods.map(p => p.id === editingId ? saved : p) : [...periods, saved];
      }

      // The handle is read from the URL rather than typed — twelve mostly
      // empty inputs across six platforms became six optional URL rows.
      const payload: SocialLinks = {};
      for (const c of channels) {
        if (!c.url.trim()) continue;
        payload[c.key] = { url: c.url.trim(), handle: handleFromUrl(c.key, c.url) || undefined };
      }
      const linkRes = await fetch(`/api/admin/clients/${clientId}/social-links`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ socialLinks: payload }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok) throw new Error(linkData.error ?? 'Failed to save channels');

      setPeriods(nextPeriods);
      setFormOpen(false);
      setEditingId(null);
      onSaved(nextPeriods, linkData.socialLinks ?? {});
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={clientName}
      subtitle="Contract & channels"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ flex: 1, fontSize: 12.5, color: T.ink3 }}>One save for the whole panel.</span>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={saveAll} disabled={saving || !canSave}>{saving ? 'Saving…' : 'Save changes'}</Button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <div style={{ fontSize: 12.5, color: T.danger }}>{error}</div>}

        {/* ── Contract periods ─────────────────────────────────────────── */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.ink3 }}>Contract periods</span>
            <button type="button" onClick={() => (formOpen && !editingId ? setFormOpen(false) : openAdd())} style={linkBtn}>
              {formOpen && !editingId ? 'Cancel new period' : '+ Add contract period'}
            </button>
          </div>

          {periods.length === 0 && !formOpen && (
            <p style={{ fontSize: 13, color: T.ink3, margin: 0 }}>No contract on file yet.</p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {periods.map(p => (
              <div key={p.id} style={{ background: T.surfaceSubtle, border: `1px solid ${T.line}`, borderRadius: 12, padding: '16px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: T.ink }}>{p.label}</span>
                  {current?.id === p.id && <StatusBadge tone="green" dot={false}>Active</StatusBadge>}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 12, color: T.ink2, marginTop: 8, lineHeight: 1.6 }}>
                  <div>{fmtDate(p.startsOn)} → {p.endsOn ? fmtDate(p.endsOn) : 'open-ended'}</div>
                  <div>
                    {p.contractedTotal} deliverables
                    {p.monthlyQuota ? ` · ${p.monthlyQuota}/month` : ''}
                    {p.clientIds.length > 1 ? ` · joint with ${p.clientIds.length - 1} other${p.clientIds.length === 2 ? '' : 's'}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
                  <button type="button" onClick={() => openEdit(p)} style={linkBtn}>Edit</button>
                  <button type="button" onClick={() => openRenew(p)} style={linkBtn}>Renew</button>
                  <button
                    type="button"
                    aria-label="More actions"
                    aria-expanded={menuOpenId === p.id}
                    onClick={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)}
                    style={{ ...linkBtn, color: T.ink3, fontSize: 15 }}
                  >
                    ⋯
                  </button>
                </div>

                {menuOpenId === p.id && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.divider}` }}>
                    <button type="button" onClick={() => { setMonthPeriodId(p.id); setMenuOpenId(null); }} style={{ ...linkBtn, color: T.ink2 }}>
                      Log a one-off change for a single month
                    </button>
                    <button type="button" onClick={() => deletePeriod(p)} style={{ ...linkBtn, color: T.destructive }}>
                      Delete this period
                    </button>
                  </div>
                )}

                {p.months.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 12, color: T.ink3 }}>
                    {p.months.length} logged month change{p.months.length === 1 ? '' : 's'}
                  </div>
                )}

                {monthPeriodId === p.id && (
                  <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8, borderTop: `1px solid ${T.divider}`, paddingTop: 12 }}>
                    <div>
                      <span style={fieldCap}>Month</span>
                      <input aria-label="Month" type="month" value={monthForm.month} onChange={e => setMonthForm(f => ({ ...f, month: e.target.value }))} style={inp} />
                    </div>
                    <div>
                      <span style={fieldCap}>Deliverables that month</span>
                      <input aria-label="Deliverables that month" type="number" value={monthForm.quotaOverride} onChange={e => setMonthForm(f => ({ ...f, quotaOverride: e.target.value }))} placeholder="Blank = the standing number" style={inp} />
                    </div>
                    <div>
                      <span style={fieldCap}>Why</span>
                      <input aria-label="Why this month deviates" value={monthForm.note} onChange={e => setMonthForm(f => ({ ...f, note: e.target.value }))} placeholder="Why this month is different" style={inp} />
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button type="button" onClick={() => setMonthPeriodId(null)} style={linkBtn}>Cancel</button>
                      <button type="button" onClick={() => saveMonth(p.id)} disabled={!monthForm.month} style={{ ...linkBtn, opacity: monthForm.month ? 1 : 0.5 }}>Log it</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── New / edit period form ───────────────────────────────────── */}
        {formOpen && (
          <section style={{ border: `1px solid ${T.line}`, borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {form.renewedFromLabel && (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: T.ink2 }}>Renewing from “{form.renewedFromLabel}”</div>
            )}

            <div>
              <span style={fieldCap}>How they buy</span>
              <div style={{ display: 'flex', gap: 10 }}>
                {([
                  { key: 'retainer', title: 'Retainer', hint: 'A fixed number every month' },
                  { key: 'package', title: 'Package', hint: 'One agreed total, no monthly rhythm' },
                ] as const).map(opt => {
                  const selected = form.model === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setForm(f => ({ ...f, model: opt.key }))}
                      style={{
                        flex: 1, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                        padding: '13px 15px', borderRadius: 10,
                        border: `1px solid ${selected ? '#ffc09a' : T.lineStrong}`,
                        background: selected ? '#fff8f5' : T.surface,
                      }}
                    >
                      <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: T.ink }}>{opt.title}</span>
                      <span style={{ display: 'block', fontSize: 12, color: T.ink3, marginTop: 3 }}>{opt.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span style={fieldCap}>Label</span>
              <input aria-label="Period label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Package 1" style={inp} />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <span style={fieldCap}>Starts</span>
                <input aria-label="Starts" type="date" value={form.startsOn} onChange={e => setForm(f => ({ ...f, startsOn: e.target.value }))} style={{ ...inp, fontFamily: MONO }} />
              </div>
              <div style={{ flex: 1 }}>
                <span style={fieldCap}>Ends</span>
                <input aria-label="Ends — leave blank for open-ended" type="date" value={form.endsOn} onChange={e => setForm(f => ({ ...f, endsOn: e.target.value }))} style={{ ...inp, fontFamily: MONO }} />
                <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 4 }}>Leave blank for open-ended.</span>
              </div>
            </div>

            {/* One quantity field, chosen by the delivery model. The old form
                had four overlapping ones and no rule for which to fill. */}
            {form.model === 'retainer' ? (
              <div>
                <span style={fieldCap}>Videos per month</span>
                <input aria-label="Videos per month" type="number" value={form.monthlyQuota} onChange={e => setForm(f => ({ ...f, monthlyQuota: e.target.value }))} placeholder="e.g. 16" style={inp} />
                <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 4 }}>Contract total is calculated from this and the term.</span>
                <div style={{ marginTop: 10 }}>
                  <span style={fieldCap}>Contract total</span>
                  <input aria-label="Contract total" type="number" value={form.contractedTotal} onChange={e => setForm(f => ({ ...f, contractedTotal: e.target.value }))} placeholder="e.g. 69" style={inp} />
                </div>
              </div>
            ) : (
              <div>
                <span style={fieldCap}>Total deliverables</span>
                <input aria-label="Total deliverables" type="number" value={form.contractedTotal} onChange={e => setForm(f => ({ ...f, contractedTotal: e.target.value }))} placeholder="e.g. 40" style={inp} />
                <span style={{ display: 'block', fontSize: 11.5, color: T.ink3, marginTop: 4 }}>The whole scope. Progress on the client page counts against it.</span>
              </div>
            )}

            <div>
              <span style={fieldCap}>Notes</span>
              <textarea aria-label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Where these numbers came from, anything unusual…" rows={3} style={{ ...inp, minHeight: 62, resize: 'vertical' }} />
            </div>

            <Disclosure label="This contract also covers other clients" open={jointOpen} onToggle={() => setJointOpen(o => !o)}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {roster.filter(c => c.id !== clientId).map(c => {
                  const checked = form.clientIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => setForm(f => ({
                        ...f,
                        clientIds: checked ? f.clientIds.filter(x => x !== c.id) : [...f.clientIds, c.id],
                      }))}
                      style={{
                        padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 600,
                        border: `1px solid ${checked ? T.brand : T.lineStrong}`,
                        background: checked ? T.brandTint : T.surface,
                        color: checked ? T.brandDark : T.ink2,
                      }}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <span style={{ fontSize: 11.5, color: T.ink3 }}>This client is always covered and is not listed here.</span>
            </Disclosure>

            <Disclosure label="Cadence, rolling cycles & carry-over" open={advancedOpen} onToggle={() => setAdvancedOpen(o => !o)}>
              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <span style={fieldCap}>Videos per week</span>
                  <input aria-label="Videos per week" type="number" value={form.cadencePerWeek} onChange={e => setForm(f => ({ ...f, cadencePerWeek: e.target.value }))} placeholder="Only if billed weekly" style={inp} />
                </div>
                <div style={{ flex: 1 }}>
                  <span style={fieldCap}>Carried over from last period</span>
                  <input aria-label="Carried over from last period" type="number" value={form.carriedIn} onChange={e => setForm(f => ({ ...f, carriedIn: e.target.value }))} placeholder="0" style={inp} />
                </div>
              </div>
              <div>
                <span style={fieldCap}>Rolling cycle length (days)</span>
                <input aria-label="Rolling cycle length in days" type="number" value={form.cycleDurationDays} onChange={e => setForm(f => ({ ...f, cycleDurationDays: e.target.value }))} placeholder="Blank = the fixed dates above" style={inp} />
              </div>
            </Disclosure>
          </section>
        )}

        {/* ── Channels ─────────────────────────────────────────────────── */}
        <section>
          <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: T.ink3 }}>Channels</span>
          <p style={{ fontSize: 12.5, color: T.ink3, margin: '6px 0 12px' }}>Paste the profile URL — we read the handle from it.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {channels.map((c, i) => {
              const platform = PLATFORMS.find(p => p.key === c.key)!;
              return (
                <div key={c.key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: platform.color, color: '#fff', fontSize: 13, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }} aria-hidden>
                    {platform.label[0]}
                  </span>
                  <input
                    aria-label={`${platform.label} profile URL`}
                    value={c.url}
                    onChange={e => setChannels(prev => prev.map((x, idx) => idx === i ? { ...x, url: e.target.value } : x))}
                    placeholder={`${platform.label} profile URL`}
                    style={{ ...inp, flex: 1 }}
                  />
                  <button
                    type="button"
                    aria-label={`Remove ${platform.label}`}
                    onClick={() => setChannels(prev => prev.filter((_, idx) => idx !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.ink3, fontSize: 15, padding: '0 4px' }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>

          {unusedPlatforms.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {unusedPlatforms.map(p => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setChannels(prev => [...prev, { key: p.key, url: '' }])}
                  style={{
                    padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, color: T.ink2,
                    border: `1px dashed ${T.lineStrong}`, background: 'transparent',
                  }}
                >
                  + {p.label}
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
