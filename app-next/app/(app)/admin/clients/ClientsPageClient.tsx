'use client';

import { useState, useEffect } from 'react';

interface PortalUser {
  id: string;
  name: string;
  email: string;
  clientName: string | null;
  emailVerified: boolean;
}

interface ClientRecord {
  id: string;
  name: string;
  type: string;
  monthlyQuota: number | null;
  clickupOptionId: string | null;
  frameioProjectId: string | null;
  whatsappNumber: string | null;
  brandingConfig: Record<string, unknown> | null;
  showCalendar: boolean | null;
  createdAt: Date | null;
  portalUsers: PortalUser[];
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

export function ClientsPageClient({ clients: initial }: { clients: ClientRecord[] }) {
  const [clients, setClients] = useState<ClientRecord[]>(initial);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [clickupOptions, setClickupOptions] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch('/api/admin/clickup-clients')
      .then(r => r.ok ? r.json() : [])
      .then((data: { id: string; name: string }[]) => setClickupOptions(data))
      .catch(() => {});
  }, []);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState('');

  // Form fields
  const [fName, setFName] = useState('');
  const [fType, setFType] = useState<'retainer' | 'one_time'>('retainer');
  const [fQuota, setFQuota] = useState('');
  const [fClickup, setFClickup] = useState('');
  const [fFrameio, setFFrameio] = useState('');
  const [fWhatsapp, setFWhatsapp] = useState('');
  const [fVistaSocial, setFVistaSocial] = useState('');
  const [fCalendar, setFCalendar] = useState(false);

  // Primary contact (create only)
  const [fContactName, setFContactName] = useState('');
  const [fContactEmail, setFContactEmail] = useState('');

  // Invite sub-form
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invEmail, setInvEmail] = useState('');
  const [invName, setInvName] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invMsg, setInvMsg] = useState('');

  function openNew() {
    setSelected(null);
    setFName(''); setFType('retainer'); setFQuota(''); setFClickup('');
    setFFrameio(''); setFWhatsapp(''); setFVistaSocial(''); setFCalendar(false);
    setFContactName(''); setFContactEmail('');
    setMsg(''); setInviteOpen(false);
    setDrawerOpen(true);
  }

  function openEdit(c: ClientRecord) {
    setSelected(c);
    setFName(c.name);
    setFType(c.type as 'retainer' | 'one_time');
    setFQuota(c.monthlyQuota?.toString() ?? '');
    setFClickup(c.clickupOptionId ?? '');
    setFFrameio(c.frameioProjectId ?? '');
    setFWhatsapp(c.whatsappNumber ?? '');
    const vs = (c.brandingConfig as { vistaSocialProfileIds?: string })?.vistaSocialProfileIds ?? '';
    setFVistaSocial(vs);
    setFCalendar(c.showCalendar ?? false);
    setMsg(''); setInviteOpen(false); setInvEmail(''); setInvName(''); setInvMsg('');
    setDrawerOpen(true);
  }

  async function save() {
    setSaving(true); setMsg('');
    const body = {
      name: fName, type: fType,
      monthlyQuota: fType === 'retainer' && fQuota ? Number(fQuota) : null,
      clickupOptionId: fClickup || null,
      frameioProjectId: fFrameio || null,
      whatsappNumber: fWhatsapp || null,
      vistaSocialProfileIds: fVistaSocial || null,
      showCalendar: fCalendar,
    };
    try {
      if (selected) {
        const res = await fetch(`/api/admin/clients/${selected.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        setClients(prev => prev.map(c => c.id === selected.id ? { ...c, ...body, portalUsers: c.portalUsers } : c));
        setMsg('Saved.');
      } else {
        const res = await fetch('/api/admin/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
        let portalUsers: PortalUser[] = [];
        if (fContactEmail && fContactName) {
          const invRes = await fetch('/api/admin/create-client', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: fContactEmail, name: fContactName, clientName: fClickup || fName }),
          });
          const invData = await invRes.json();
          if (invRes.ok) {
            portalUsers = [{ id: invData.id ?? fContactEmail, name: fContactName, email: fContactEmail, clientName: fClickup || fName, emailVerified: false }];
          }
        }
        const newClient = { ...data.client, brandingConfig: data.client.brandingConfig as Record<string, unknown> | null, portalUsers };
        setClients(prev => [newClient, ...prev]);
        setMsg(fContactEmail ? 'Client created and invite sent.' : 'Client created.');
        setSelected(newClient);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function del() {
    if (!selected) return;
    if (!confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
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
        body: JSON.stringify({ email: u.email, name: u.name, clientName: selected.clickupOptionId || selected.name }),
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
    setInviting(true); setInvMsg('');
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, name: invName, clientName: selected.clickupOptionId || selected.name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      const newUser: PortalUser = { id: data.id ?? invEmail, name: invName, email: invEmail, clientName: selected.clickupOptionId || selected.name, emailVerified: false };
      setClients(prev => prev.map(c => c.id === selected.id ? { ...c, portalUsers: [...c.portalUsers, newUser] } : c));
      setSelected(prev => prev ? { ...prev, portalUsers: [...prev.portalUsers, newUser] } : prev);
      setInvMsg('Invited!');
      setInvEmail(''); setInvName('');
      setInviteOpen(false);
    } catch (e) {
      setInvMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setInviting(false);
    }
  }

  const hasLinkedUsers = (selected?.portalUsers.length ?? 0) > 0;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div className="db-topbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: '1px solid #e7ebef', background: '#fff', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111c28' }}>Clients</div>
            <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 2 }}>{clients.length} client{clients.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#FF6000', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15 }}><path d="M12 5v14M5 12h14" /></svg>
            New client
          </button>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
          <div className="db-tscroll" style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e7ebef' }}>
                  {['Client', 'Type', 'Quota', 'ClickUp', 'Portal users', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#8b97a4', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'inherit' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '48px 16px', textAlign: 'center', color: '#8b97a4', fontSize: 14 }}>No clients yet. Create one to get started.</td></tr>
                )}
                {clients.map((c, i) => (
                  <tr key={c.id} onClick={() => openEdit(c)} style={{ borderBottom: i < clients.length - 1 ? '1px solid #f4f6f8' : 'none', cursor: 'pointer', background: selected?.id === c.id ? '#fff8f5' : 'transparent' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(c.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</span>
                        <span style={{ fontWeight: 600, color: '#111c28' }}>{c.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: c.type === 'retainer' ? '#1a56a0' : '#7c3aed', background: c.type === 'retainer' ? '#dbeafe' : '#ede9fe' }}>
                        {c.type === 'retainer' ? 'Retainer' : 'One-time'}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', color: c.monthlyQuota ? '#111c28' : '#8b97a4', fontWeight: c.monthlyQuota ? 600 : 400 }}>
                      {c.monthlyQuota ? `${c.monthlyQuota}/mo` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      {c.clickupOptionId
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#14805f' }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M20 6 9 17l-5-5" /></svg>Mapped</span>
                        : <span style={{ fontSize: 12, fontWeight: 600, color: '#b06f06' }}>Not mapped</span>}
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
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,28,40,.3)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, background: '#fff', boxShadow: '-8px 0 32px rgba(17,28,40,.12)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>

            {/* Drawer header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e7ebef', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>{selected ? selected.name : 'New client'}</h3>
                <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 3 }}>{selected ? 'Edit client details' : 'Add a client to the portal'}</div>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#54616f', padding: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {/* Name */}
              <div>
                <span style={label}>Client name</span>
                <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Ohr Shlomo" style={inp} />
              </div>

              {/* Type */}
              <div>
                <span style={label}>Type</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['retainer', 'one_time'] as const).map(t => (
                    <button key={t} onClick={() => setFType(t)} style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: `1px solid ${fType === t ? '#FF6000' : '#d4dbe2'}`, background: fType === t ? '#fff8f5' : '#fff', color: fType === t ? '#FF6000' : '#54616f', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                      {t === 'retainer' ? 'Retainer' : 'One-time'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quota (retainer only) */}
              {fType === 'retainer' && (
                <div>
                  <span style={label}>Monthly video quota</span>
                  <input type="number" min="1" value={fQuota} onChange={e => setFQuota(e.target.value)} placeholder="8" style={{ ...inp, width: 120 }} />
                </div>
              )}

              {/* ClickUp */}
              <div>
                <span style={label}>ClickUp client name</span>
                <select
                  value={fClickup}
                  onChange={e => setFClickup(e.target.value)}
                  style={{ ...inp, cursor: 'pointer' }}
                >
                  <option value="">— select from ClickUp —</option>
                  {clickupOptions.map(o => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Frame.io */}
              <div>
                <span style={label}>Frame.io project ID <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></span>
                <input value={fFrameio} onChange={e => setFFrameio(e.target.value)} placeholder="abc123" style={inp} />
              </div>

              {/* WhatsApp */}
              <div>
                <span style={label}>WhatsApp number <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></span>
                <input value={fWhatsapp} onChange={e => setFWhatsapp(e.target.value)} placeholder="+1 809 555 0000" style={inp} />
              </div>

              {/* Vista Social */}
              <div>
                <span style={label}>Vista Social profile IDs <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(comma-separated, optional)</span></span>
                <input value={fVistaSocial} onChange={e => setFVistaSocial(e.target.value)} placeholder="id1, id2" style={inp} />
              </div>

              {/* Calendar toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111c28' }}>Show publishing calendar</div>
                  <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 2 }}>Client can see scheduled posts in their portal</div>
                </div>
                <div onClick={() => setFCalendar(v => !v)} style={{ width: 40, height: 22, borderRadius: 11, background: fCalendar ? '#FF6000' : '#d4dbe2', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                  <div style={{ position: 'absolute', top: 3, left: fCalendar ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,.2)' }} />
                </div>
              </div>

              {/* Primary contact (create only) */}
              {!selected && (
                <>
                  <div style={{ borderTop: '1px solid #e7ebef', margin: '4px 0' }} />
                  <div>
                    <span style={label}>Primary contact <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — sends magic link invite)</span></span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <input value={fContactName} onChange={e => setFContactName(e.target.value)} placeholder="Full name" style={inp} />
                      <input type="email" value={fContactEmail} onChange={e => setFContactEmail(e.target.value)} placeholder="client@example.com" style={inp} />
                    </div>
                  </div>
                </>
              )}

              {/* Divider */}
              {selected && <div style={{ borderTop: '1px solid #e7ebef', margin: '4px 0' }} />}

              {/* Portal users */}
              {selected && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={label}>Portal access</span>
                    <button onClick={() => { setInviteOpen(v => !v); setInvMsg(''); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: '#FF6000', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 13, height: 13 }}><path d="M12 5v14M5 12h14" /></svg>
                      Invite user
                    </button>
                  </div>

                  {inviteOpen && (
                    <div style={{ background: '#f4f6f8', borderRadius: 10, padding: '14px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input value={invName} onChange={e => setInvName(e.target.value)} placeholder="Full name" style={inp} />
                      <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)} placeholder="client@example.com" style={inp} />
                      {invMsg && <div style={{ fontSize: 12, color: invMsg === 'Invited!' ? '#14805f' : '#cf3f36' }}>{invMsg}</div>}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setInviteOpen(false)} style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                        <button onClick={invite} disabled={inviting || !invEmail || !invName} style={{ flex: 1, padding: '7px 12px', borderRadius: 7, border: 'none', background: inviting || !invEmail || !invName ? '#eef1f4' : '#FF6000', color: inviting || !invEmail || !invName ? '#8b97a4' : '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
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
                              <button onClick={() => resendInvite(u)} title="Resend invite" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Resend</button>
                              <button onClick={() => cancelInvite(u)} title="Cancel invitation" style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #fbd5d0', background: '#fef2f1', color: '#cf3f36', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Remove</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Delete */}
              {selected && (
                <div style={{ borderTop: '1px solid #e7ebef', paddingTop: 16, marginTop: 4 }}>
                  <button
                    onClick={del}
                    disabled={deleting || hasLinkedUsers}
                    title={hasLinkedUsers ? 'Remove all portal users before deleting this client' : ''}
                    style={{ fontSize: 13, color: hasLinkedUsers ? '#8b97a4' : '#cf3f36', background: 'none', border: 'none', cursor: hasLinkedUsers ? 'not-allowed' : 'pointer', padding: 0, fontFamily: 'inherit', fontWeight: 600 }}
                  >
                    {deleting ? 'Deleting…' : 'Delete client'}
                  </button>
                  {hasLinkedUsers && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>Remove all portal users before deleting.</div>}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #e7ebef', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
              {msg && <span style={{ flex: 1, fontSize: 13, color: msg.includes('rror') || msg.includes('ail') || msg.includes('annot') ? '#cf3f36' : '#14805f' }}>{msg}</span>}
              {!msg && <span style={{ flex: 1 }} />}
              <button onClick={() => setDrawerOpen(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={save} disabled={saving || !fName || !fType} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving || !fName ? '#eef1f4' : '#FF6000', color: saving || !fName ? '#8b97a4' : '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : selected ? 'Save changes' : 'Create client'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
