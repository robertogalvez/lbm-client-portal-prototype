'use client';

import { useState, useEffect, useRef } from 'react';
import { Toggle } from '@/components/ui/Toggle';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  clientName: string | null;
  emailVerified: boolean;
}

interface ContractMonthRecord {
  id: string;
  periodId: string;
  month: string;
  active: boolean;
  quotaOverride: number | null;
  scopeNote: string | null;
  amended: boolean;
  note: string | null;
}

interface ContractPeriodRecord {
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

type SocialLinks = Record<string, { handle?: string; url?: string }>;

interface ClientRecord {
  id: string;
  name: string;
  type: string | null;
  monthlyQuota: number | null;
  monthlyReels: number;
  monthlyYoutube: number;
  clickupTaskId: string;
  frameioProjectId: string | null;
  whatsappNumber: string | null;
  brandingConfig: Record<string, unknown> | null;
  socialLinks: SocialLinks | null;
  showCalendar: boolean | null;
  showInvoices: boolean | null;
  showReport: boolean | null;
  notifyEmail: boolean | null;
  notifySms: boolean | null;
  notifyPush: boolean | null;
  contactName: string | null;
  contactEmail: string | null;
  clientStatus: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date | null;
  portalUsers: PortalUser[];
  periods: ContractPeriodRecord[];
}

const PLATFORMS = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'website', label: 'Website' },
] as const;

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

const AVATAR_COLORS = ['#5e6b7a', '#5172c4', '#b58236', '#7c66c4', '#cf5b53', '#14805f', '#b06f06'];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}
function isValidClickUpTaskId(taskId: string): boolean {
  // Valid task IDs are alphanumeric strings (usually 7-10 chars), e.g. "86aed7r1z"
  // Invalid ones contain spaces or look like names, e.g. "ClickUp Testing", "Sebastian Velasquez"
  return /^[a-z0-9]+$/i.test(taskId) && taskId.length >= 7;
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

const readonlyRow: React.CSSProperties = {
  fontSize: 14, color: '#111c28', padding: '8px 0', borderBottom: '1px solid #f4f6f8',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
};

const smallBtn: React.CSSProperties = {
  flex: 1, padding: '7px 12px', borderRadius: 7, fontWeight: 600, fontSize: 13,
  cursor: 'pointer', fontFamily: 'inherit', border: '1px solid #d4dbe2', background: '#fff', color: '#54616f',
};
function smallSaveBtn(disabled: boolean): React.CSSProperties {
  return { ...smallBtn, border: 'none', background: disabled ? '#eef1f4' : '#FF6000', color: disabled ? '#8b97a4' : '#fff' };
}
const linkBtn: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none',
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};

export function ClientsPageClient({ clients: initial }: { clients: ClientRecord[] }) {
  const [clients, setClients] = useState<ClientRecord[]>(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Escape closes the drawer. Without this the only ways out were clicking the
  // backdrop or the close button, leaving keyboard users stuck behind it.
  useEffect(() => {
    if (!drawerOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Portal-only fields (the only ones an admin can edit — everything else comes from ClickUp)
  const [fType, setFType] = useState<'retainer' | 'one_time' | null>(null);
  const [fCalendar, setFCalendar] = useState(false);
  const [fInvoices, setFInvoices] = useState(false);
  const [fReport, setFReport] = useState(false);
  const [fNotifyEmail, setFNotifyEmail] = useState(true);
  const [fNotifySms, setFNotifySms] = useState(false);

  // Invite sub-form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [inviting, setInviting] = useState(false);
  // Shared in-flight flag for the drawer's mutating actions. Unlike the
  // useState flags above it updates synchronously, so it is what actually
  // blocks a second click landing before the re-render disables the button.
  const mutating = useRef(false);
  const [invMsg, setInvMsg] = useState('');

  // Contract periods sub-form (add or edit) — reuses the same
  // toggle-a-sub-form pattern as the invite form above.
  const [periodFormOpen, setPeriodFormOpen] = useState(false);
  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [periodForm, setPeriodForm] = useState(emptyPeriodForm());
  const [savingPeriod, setSavingPeriod] = useState(false);
  const [periodMsg, setPeriodMsg] = useState('');
  const [deletingPeriodId, setDeletingPeriodId] = useState<string | null>(null);

  // Contract month deviation sub-form, scoped to one period at a time.
  const [monthFormPeriodId, setMonthFormPeriodId] = useState<string | null>(null);
  const [editingMonthId, setEditingMonthId] = useState<string | null>(null);
  const [monthForm, setMonthForm] = useState(emptyMonthForm());
  const [savingMonth, setSavingMonth] = useState(false);
  const [monthMsg, setMonthMsg] = useState('');

  // Social/platform links — one handle+url pair per platform.
  const [socialForm, setSocialForm] = useState<Record<string, { handle: string; url: string }>>({});

  function openEdit(c: ClientRecord) {
    setSelected(c);
    setFType((c.type as 'retainer' | 'one_time' | null) ?? null);
    setFCalendar(c.showCalendar ?? false);
    setFInvoices(c.showInvoices ?? false);
    setFReport(c.showReport ?? false);
    setFNotifyEmail(c.notifyEmail ?? true);
    setFNotifySms(c.notifySms ?? false);
    setMsg(''); setInviteOpen(false);
    setInvName(c.portalUsers.length === 0 ? (c.contactName ?? '') : '');
    setInvEmail(c.portalUsers.length === 0 ? (c.contactEmail ?? '') : '');
    setInvMsg('');
    setPeriodFormOpen(false); setEditingPeriodId(null); setPeriodForm(emptyPeriodForm()); setPeriodMsg('');
    setMonthFormPeriodId(null); setEditingMonthId(null); setMonthForm(emptyMonthForm()); setMonthMsg('');
    const nextSocial: Record<string, { handle: string; url: string }> = {};
    for (const p of PLATFORMS) {
      const entry = c.socialLinks?.[p.key];
      nextSocial[p.key] = { handle: entry?.handle ?? '', url: entry?.url ?? '' };
    }
    setSocialForm(nextSocial);
    setDrawerOpen(true);
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setMsg('');
    const body = {
      type: fType,
      showCalendar: fCalendar,
      showInvoices: fInvoices,
      showReport: fReport,
      notifyEmail: fNotifyEmail,
      notifySms: fNotifySms,
      socialLinks: socialForm,
    };
    try {
      const res = await fetch(`/api/admin/clients/${selected.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, ...body } : c));
      setSelected(prev => prev ? { ...prev, ...body } : prev);
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function syncNow() {
    setSyncing(true); setSyncMsg('');
    try {
      const res = await fetch('/api/admin/clients/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      setSyncMsg(`Synced ${data.synced} client${data.synced === 1 ? '' : 's'}${data.skipped ? `, skipped ${data.skipped} without a Client Status` : ''}.`);
      const listRes = await fetch('/api/admin/clients');
      if (listRes.ok) setClients(await listRes.json());
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSyncing(false);
    }
  }

  async function del() {
    if (!selected) return;
    // setDeleting only takes effect on the next render, so the ref is what
    // actually stops a second click from firing a second DELETE.
    if (mutating.current) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone, and it will reappear on the next ClickUp sync if it's still Active/Inactive there.`)) return;
    mutating.current = true;
    setDeleting(true); setMsg('');
    try {
      const res = await fetch(`/api/admin/clients/${selected.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setClients(prev => prev.filter(c => c.id !== selected.id));
      setDrawerOpen(false);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setDeleting(false);
    }
  }

  const [viewingAs, setViewingAs] = useState<string | null>(null);

  async function viewAsClient(c: ClientRecord, e: React.MouseEvent) {
    e.stopPropagation();
    setViewingAs(c.id);
    try {
      const res = await fetch('/api/admin/view-as', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: c.id }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start client view');
      window.location.assign('/client');
    } catch (err) {
      setViewingAs(null);
      alert(err instanceof Error ? err.message : 'Error');
    }
  }

  async function resendInvite(u: PortalUser) {
    if (!selected) return;
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: u.email, name: u.name, clientName: selected.name }),
      });
      if (!res.ok) throw new Error('Failed to resend');
      setMsg('Invite resent to ' + u.email);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function cancelInvite(u: PortalUser) {
    if (!selected) return;
    if (!confirm(`Remove portal access for ${u.name}?`)) return;
    try {
      const res = await fetch(`/api/admin/portal-user/${u.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const updated = selected.portalUsers.filter(p => p.id !== u.id);
      setSelected(prev => prev ? { ...prev, portalUsers: updated } : prev);
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, portalUsers: updated } : c));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    }
  }

  async function invite() {
    if (!selected || !invEmail || !invName) return;
    // Guards against a double-click sending the client two invite emails.
    if (mutating.current) return;
    mutating.current = true;
    setInviting(true); setInvMsg('');
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, name: invName, clientName: selected.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const newUser: PortalUser = { id: data.id ?? invEmail, name: invName, email: invEmail, clientName: selected.name, emailVerified: false };
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, portalUsers: [...c.portalUsers, newUser] } : c));
      setSelected(prev => prev ? { ...prev, portalUsers: [...prev.portalUsers, newUser] } : prev);
      setInvMsg('Invited!');
      setInvEmail(''); setInvName('');
      setInviteOpen(false);
    } catch (e) {
      setInvMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
      setInviting(false);
    }
  }

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
    if (!selected) return;
    if (mutating.current) return;
    mutating.current = true;
    setSavingPeriod(true); setPeriodMsg('');
    const body = {
      clientId: selected.id,
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
        ? { ...data.period, months: selected.periods.find(p => p.id === editingPeriodId)?.months ?? [] }
        : { ...data.period, months: [] };
      const nextPeriods = editingPeriodId
        ? selected.periods.map(p => p.id === editingPeriodId ? saved : p)
        : [...selected.periods, saved];
      setSelected(prev => prev ? { ...prev, periods: nextPeriods } : prev);
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, periods: nextPeriods } : c));
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
    if (!selected) return;
    if (mutating.current) return;
    if (!confirm(`Delete contract period "${p.label}"? This also deletes its monthly deviation rows. This cannot be undone.`)) return;
    mutating.current = true;
    setDeletingPeriodId(p.id);
    try {
      const res = await fetch(`/api/admin/contracts/${p.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const nextPeriods = selected.periods.filter(x => x.id !== p.id);
      setSelected(prev => prev ? { ...prev, periods: nextPeriods } : prev);
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, periods: nextPeriods } : c));
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
    if (!selected) return;
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
      const nextPeriods = selected.periods.map(p => {
        if (p.id !== periodId) return p;
        const nextMonths = editingMonthId ? p.months.map(m => m.id === editingMonthId ? saved : m) : [...p.months, saved];
        return { ...p, months: nextMonths };
      });
      setSelected(prev => prev ? { ...prev, periods: nextPeriods } : prev);
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, periods: nextPeriods } : c));
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
    if (!selected) return;
    if (mutating.current) return;
    if (!confirm(`Delete the ${m.month} deviation row? This cannot be undone.`)) return;
    mutating.current = true;
    try {
      const res = await fetch(`/api/admin/contracts/months/${m.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const nextPeriods = selected.periods.map(p => p.id === periodId ? { ...p, months: p.months.filter(x => x.id !== m.id) } : p);
      setSelected(prev => prev ? { ...prev, periods: nextPeriods } : prev);
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, periods: nextPeriods } : c));
    } catch (e) {
      setMonthMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      mutating.current = false;
    }
  }

  const hasLinkedUsers = (selected?.portalUsers.length ?? 0) > 0;
  const visibleClients = clients.filter(c => showInactive || c.clientStatus !== 'Inactive');
  const inactiveCount = clients.length - clients.filter(c => c.clientStatus !== 'Inactive').length;

  const periodFormJsx = (
    <div style={{ background: '#f4f6f8', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input aria-label="Period label" value={periodForm.label} onChange={e => setPeriodForm(f => ({ ...f, label: e.target.value }))} placeholder="Label (e.g. Contract 1)" style={inp} />
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Start date" type="date" value={periodForm.startsOn} onChange={e => setPeriodForm(f => ({ ...f, startsOn: e.target.value }))} style={inp} />
        <input aria-label="End date (blank = open-ended)" type="date" value={periodForm.endsOn} onChange={e => setPeriodForm(f => ({ ...f, endsOn: e.target.value }))} style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <select aria-label="Delivery model" value={periodForm.model} onChange={e => setPeriodForm(f => ({ ...f, model: e.target.value }))} style={inp}>
          {CONTRACT_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select aria-label="Contract state" value={periodForm.state} onChange={e => setPeriodForm(f => ({ ...f, state: e.target.value }))} style={inp}>
          {CONTRACT_STATES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Cadence per week" type="number" value={periodForm.cadencePerWeek} onChange={e => setPeriodForm(f => ({ ...f, cadencePerWeek: e.target.value }))} placeholder="Cadence/week" style={inp} />
        <input aria-label="Monthly quota" type="number" value={periodForm.monthlyQuota} onChange={e => setPeriodForm(f => ({ ...f, monthlyQuota: e.target.value }))} placeholder="Monthly quota" style={inp} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input aria-label="Contracted total" type="number" value={periodForm.contractedTotal} onChange={e => setPeriodForm(f => ({ ...f, contractedTotal: e.target.value }))} placeholder="Contracted total *" style={inp} />
        <input aria-label="Carried in" type="number" value={periodForm.carriedIn} onChange={e => setPeriodForm(f => ({ ...f, carriedIn: e.target.value }))} placeholder="Carried in" style={inp} />
      </div>
      <textarea aria-label="Notes" value={periodForm.notes} onChange={e => setPeriodForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notes" rows={2} style={{ ...inp, resize: 'vertical' }} />
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
        <input aria-label="Month" type="month" value={monthForm.month} onChange={e => setMonthForm(f => ({ ...f, month: e.target.value }))} style={inp} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input aria-label="Quota override" type="number" value={monthForm.quotaOverride} onChange={e => setMonthForm(f => ({ ...f, quotaOverride: e.target.value }))} placeholder="Quota override" style={inp} />
          <input aria-label="Scope note" value={monthForm.scopeNote} onChange={e => setMonthForm(f => ({ ...f, scopeNote: e.target.value }))} placeholder="Scope note" style={inp} />
        </div>
        <input aria-label="Note" value={monthForm.note} onChange={e => setMonthForm(f => ({ ...f, note: e.target.value }))} placeholder="Note" style={inp} />
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
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div className="db-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: '1px solid #e7ebef', background: '#fff', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111c28' }}>Clients</div>
            <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 2 }}>{visibleClients.length} client{visibleClients.length !== 1 ? 's' : ''} · synced from ClickUp&apos;s Master Clients List</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600, color: '#54616f', cursor: 'pointer' }}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} style={{ cursor: 'pointer' }} />
              Show inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ''}
            </label>
            {syncMsg && <span style={{ fontSize: 13, color: syncMsg.includes('rror') || syncMsg.includes('ail') ? '#cf3f36' : '#54616f' }}>{syncMsg}</span>}
            <button type="button" onClick={syncNow} disabled={syncing} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 14, cursor: syncing ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M21 2v6h-6M3 22v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0 0 20.49 15" /></svg>
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          <div className="db-tscroll" style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e7ebef' }}>
                  {['Client', 'Type', 'Reels/mo', 'YouTube/mo', 'Status', 'Portal users', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'inherit' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleClients.length === 0 && (
                  <tr><td colSpan={7} style={{ padding: '48px 16px', textAlign: 'center', color: '#8b97a4', fontSize: 14 }}>{clients.length === 0 ? <>No clients yet. Click &quot;Sync now&quot; to pull clients from ClickUp&apos;s Master Clients List.</> : 'No active clients. Check "Show inactive" to see them.'}</td></tr>
                )}
                {visibleClients.map((c, i) => (
                  <tr key={c.id} onClick={() => openEdit(c)} style={{ borderBottom: i < visibleClients.length - 1 ? '1px solid #f4f6f8' : 'none', cursor: 'pointer', background: selected?.id === c.id ? '#fff8f5' : 'transparent' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(c.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</span>
                        <span style={{ fontWeight: 600, color: '#111c28' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.type
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: c.type === 'retainer' ? '#1a56a0' : '#7c3aed', background: c.type === 'retainer' ? '#dbeafe' : '#ede9fe' }}>
                            {c.type === 'retainer' ? 'Retainer' : 'One-time'}
                          </span>
                        : <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: '#b06f06', background: '#fdf3e1' }}>Needs setup</span>}
                    </td>
                    <td style={{ padding: '12px 16px', color: c.monthlyReels > 0 ? '#111c28' : '#8b97a4', fontWeight: c.monthlyReels > 0 ? 600 : 400 }}>
                      {c.monthlyReels > 0 ? `${c.monthlyReels}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', color: c.monthlyYoutube > 0 ? '#111c28' : '#8b97a4', fontWeight: c.monthlyYoutube > 0 ? 600 : 400 }}>
                      {c.monthlyYoutube > 0 ? `${c.monthlyYoutube}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.clientStatus
                        ? <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: c.clientStatus === 'Active' ? '#14805f' : '#8b97a4', background: c.clientStatus === 'Active' ? '#e6f4ee' : '#f4f6f8' }}>{c.clientStatus}</span>
                        : <span style={{ fontSize: 13, color: '#8b97a4' }}>—</span>}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: -4 }}>
                        {c.portalUsers.slice(0, 3).map((u, j) => (
                          <span key={u.id} style={{ width: 24, height: 24, borderRadius: '50%', background: avatarColor(u.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, border: '2px solid #fff', marginLeft: j > 0 ? -6 : 0 }}>{initials(u.name)}</span>
                        ))}
                        {c.portalUsers.length === 0 && <span style={{ fontSize: 13, color: '#8b97a4' }}>—</span>}
                        {c.portalUsers.length > 3 && <span style={{ fontSize: 11, color: '#8b97a4', marginLeft: 6 }}>+{c.portalUsers.length - 3}</span>}
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <button
                          type="button"
                          onClick={e => viewAsClient(c, e)}
                          disabled={viewingAs === c.id}
                          title="View the portal exactly as this client sees it"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, color: '#54616f', fontWeight: 600, background: 'none', border: 'none', cursor: viewingAs === c.id ? 'default' : 'pointer', padding: 0, fontFamily: 'inherit' }}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" /><circle cx="12" cy="12" r="3" /></svg>
                          {viewingAs === c.id ? 'Opening…' : 'View portal'}
                        </button>
                        <span style={{ fontSize: 13, color: '#FF6000', fontWeight: 600 }}>Edit →</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {drawerOpen && selected && (
        <>
          {/* Decorative click-away target. Hidden from assistive tech because it
              is not a control — Escape and the close button do the same job. */}
          <div aria-hidden="true" onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,28,40,.3)', zIndex: 40 }} />
          <div role="dialog" aria-modal="true" aria-labelledby="client-drawer-title" style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', boxShadow: '-8px 0 32px rgba(17,28,40,.12)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>

            {/* Drawer header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e7ebef', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h3 id="client-drawer-title" style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>{selected.name}</h3>
                <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 3 }}>Client details</div>
              </div>
              <button type="button" aria-label="Close client details" onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#54616f', padding: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* From ClickUp (read-only) */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={label}>From ClickUp</span>
                  {isValidClickUpTaskId(selected.clickupTaskId) ? (
                    <a href={`https://app.clickup.com/t/${selected.clickupTaskId}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600, color: '#FF6000', textDecoration: 'none' }}>Open in ClickUp →</a>
                  ) : (
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#cf3f36' }}>Invalid task ID</span>
                  )}
                </div>
                <div style={readonlyRow}><span style={{ color: '#8b97a4' }}>Contact</span><span>{selected.contactName || '—'}</span></div>
                <div style={readonlyRow}><span style={{ color: '#8b97a4' }}>Email</span><span>{selected.contactEmail || '—'}</span></div>
                <div style={readonlyRow}><span style={{ color: '#8b97a4' }}>Phone</span><span>{selected.whatsappNumber || '—'}</span></div>
                <div style={readonlyRow}><span style={{ color: '#8b97a4' }}>Client status</span><span>{selected.clientStatus || '—'}</span></div>
                <div style={readonlyRow}><span style={{ color: '#8b97a4' }}>Reels / month</span><span>{selected.monthlyReels > 0 ? `${selected.monthlyReels}` : '—'}</span></div>
                <div style={{ ...readonlyRow, borderBottom: 'none' }}><span style={{ color: '#8b97a4' }}>YouTube videos / month</span><span>{selected.monthlyYoutube > 0 ? `${selected.monthlyYoutube}` : '—'}</span></div>
                {selected.lastSyncedAt && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>Last synced {new Date(selected.lastSyncedAt).toLocaleString()}</div>}
              </div>

              <div style={{ borderTop: '1px solid #e7ebef' }} />

              {/* Contracts (editable) */}
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

                {selected.periods.length === 0 && !periodFormOpen ? (
                  <div style={{ fontSize: 13, color: '#8b97a4', fontStyle: 'italic' }}>No contract periods yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selected.periods.map(p => (
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

              {/* Social & platform links (editable, saved with the form below) */}
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
                <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 6 }}>Saved with the rest of this form — click &quot;Save changes&quot; below.</div>
              </div>

              <div style={{ borderTop: '1px solid #e7ebef' }} />

              {/* Portal settings (editable) */}
              <div>
                <span style={label}>Portal settings</span>
              </div>

              {/* Type */}
              <div>
                <span style={label}>Billing type</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['retainer', 'one_time'] as const).map(t => (
                    <button type="button" key={t} onClick={() => setFType(t)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${fType === t ? '#FF6000' : '#d4dbe2'}`, background: fType === t ? '#fff8f5' : '#fff', color: fType === t ? '#FF6000' : '#54616f', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {t === 'retainer' ? 'Retainer' : 'One-time'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Frame.io (from ClickUp) */}
              <div>
                <span style={label}>Frame.io project ID</span>
                <div style={readonlyRow}><span style={{ color: '#111c28', wordBreak: 'break-all' }}>{selected.frameioProjectId || '—'}</span></div>
              </div>

              {/* Vista Social (from ClickUp) */}
              <div>
                <span style={label}>Vista Social profile IDs</span>
                <div style={readonlyRow}><span style={{ color: '#111c28', wordBreak: 'break-all' }}>{((selected.brandingConfig as { vistaSocialProfileIds?: string })?.vistaSocialProfileIds) || '—'}</span></div>
              </div>

              {/* Calendar toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>Show publishing calendar</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Client can see scheduled posts in their portal</div>
                </div>
                <Toggle checked={fCalendar} onChange={setFCalendar} label="Show publishing calendar" />
              </div>

              {/* Invoices toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>Show invoices</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Client can see billing history in their portal</div>
                </div>
                <Toggle checked={fInvoices} onChange={setFInvoices} label="Show invoices" />
              </div>

              {/* Report toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>Show posted-on-socials report</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Client can see a monthly report of published videos in their portal</div>
                </div>
                <Toggle checked={fReport} onChange={setFReport} label="Show posted-on-socials report" />
              </div>

              <div style={{ borderTop: '1px solid #e7ebef', margin: '4px 0' }} />

              {/* Notification preferences */}
              <div>
                <span style={label}>Video-ready-for-review notifications</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>Email</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Sent to {selected.contactEmail || 'the client’s contact email (not set)'}</div>
                </div>
                <Toggle checked={fNotifyEmail} onChange={setFNotifyEmail} label="Email notifications for videos ready for review" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>SMS</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Sent to {selected.whatsappNumber || 'the client’s phone number (not set)'}</div>
                </div>
                <Toggle checked={fNotifySms} onChange={setFNotifySms} label="SMS notifications for videos ready for review" />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.5 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>Push notification</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Coming soon</div>
                </div>
                <Toggle checked={false} disabled label="Push notifications (not yet available)" />
              </div>

              <div style={{ borderTop: '1px solid #e7ebef', margin: '4px 0' }} />

              {/* Portal users */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={label}>Portal access</span>
                  <button type="button" onClick={() => { setInviteOpen(v => !v); setInvMsg(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><path d="M12 5v14M5 12h14" /></svg>
                    Invite user
                  </button>
                </div>

                {inviteOpen && (
                  <div style={{ background: '#f4f6f8', borderRadius: 10, padding: '14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input aria-label="Full name" value={invName} onChange={e => setInvName(e.target.value)} placeholder="Full name" style={inp} />
                    <input aria-label="Email address" type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="client@example.com" style={inp} />
                    {invMsg && <div style={{ fontSize: 12, color: invMsg === 'Invited!' ? '#14805f' : '#cf3f36' }}>{invMsg}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" onClick={() => setInviteOpen(false)} style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      <button type="button" onClick={invite} disabled={inviting || !invEmail || !invName} style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: 'none', background: inviting || !invEmail || !invName ? '#eef1f4' : '#FF6000', color: inviting || !invEmail || !invName ? '#8b97a4' : '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        {inviting ? 'Sending…' : 'Send invite'}
                      </button>
                    </div>
                  </div>
                )}

                {selected.portalUsers.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#8b97a4', fontStyle: 'italic' }}>No portal users yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selected.portalUsers.map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#f4f6f8', borderRadius: 8 }}>
                        <span style={{ width: 28, height: 28, borderRadius: '50%', background: avatarColor(u.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{initials(u.name)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: '#111c28' }}>{u.name}</div>
                          <div style={{ fontSize: 12, color: '#8b97a4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 100, color: u.emailVerified ? '#14805f' : '#b06f06', background: u.emailVerified ? '#e6f4ee' : '#fdf3e1', flexShrink: 0 }}>
                          {u.emailVerified ? 'Active' : 'Pending'}
                        </span>
                        {!u.emailVerified && (
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button type="button" onClick={() => resendInvite(u)} title="Resend invite" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Resend</button>
                            <button type="button" onClick={() => cancelInvite(u)} title="Cancel invitation" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fbd5d0', background: '#fef2f1', color: '#cf3f36', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete */}
              <div style={{ borderTop: '1px solid #e7ebef', paddingTop: 16, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={del}
                  disabled={deleting || hasLinkedUsers}
                  title={hasLinkedUsers ? 'Remove all portal users before deleting this client' : ''}
                  style={{ fontSize: 13, color: hasLinkedUsers ? '#8b97a4' : '#cf3f36', background: 'none', border: 'none', cursor: hasLinkedUsers ? 'not-allowed' : 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}
                >
                  {deleting ? 'Deleting…' : 'Delete client'}
                </button>
                {hasLinkedUsers && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>Remove all portal users before deleting.</div>}
              </div>
            </div>

            {/* Drawer footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e7ebef', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {msg && <span style={{ flex: 1, fontSize: 13, color: msg.includes('rror') || msg.includes('ail') || msg.includes('annot') ? '#cf3f36' : '#14805f' }}>{msg}</span>}
              {!msg && <span style={{ flex: 1 }} />}
              <button type="button" onClick={() => setDrawerOpen(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button type="button" onClick={save} disabled={saving} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving ? '#eef1f4' : '#FF6000', color: saving ? '#8b97a4' : '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
