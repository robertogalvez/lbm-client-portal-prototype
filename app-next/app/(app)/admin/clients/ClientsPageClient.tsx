'use client';

import { useState } from 'react';

interface ClientRow {
  id: string;
  name: string;
  email: string;
  clientName: string | null;
  emailVerified: boolean;
  createdAt: Date;
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['#5e6b7a','#5172c4','#b58236','#7c66c4','#cf5b53','#14805f','#b06f06'];
function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function statusFor(c: ClientRow): { label: string; color: string; bg: string } {
  if (c.emailVerified) return { label: 'Active', color: '#14805f', bg: '#e6f4ee' };
  if (c.createdAt)     return { label: 'Invite sent', color: '#b06f06', bg: '#fdf3e1' };
  return { label: 'Not invited', color: '#54616f', bg: '#eef1f4' };
}

export function ClientsPageClient({ clients: initialClients }: { clients: ClientRow[] }) {
  const [clients, setClients] = useState<ClientRow[]>(initialClients);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selected, setSelected] = useState<ClientRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const [fName, setFName]           = useState('');
  const [fEmail, setFEmail]         = useState('');
  const [fClientName, setFClientName] = useState('');

  function openNew() {
    setSelected(null);
    setFName(''); setFEmail(''); setFClientName('');
    setSaveMsg('');
    setDrawerOpen(true);
  }

  function openEdit(c: ClientRow) {
    setSelected(c);
    setFName(c.name); setFEmail(c.email); setFClientName(c.clientName ?? '');
    setSaveMsg('');
    setDrawerOpen(true);
  }

  async function save() {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fEmail, name: fName, clientName: fClientName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setSaveMsg(data.action === 'created' ? 'Client created.' : 'Client updated.');
      const updated: ClientRow = {
        id: data.id ?? selected?.id ?? fEmail,
        name: fName, email: fEmail, clientName: fClientName,
        emailVerified: selected?.emailVerified ?? false,
        createdAt: selected?.createdAt ?? new Date(),
      };
      if (data.action === 'created') {
        setClients(prev => [updated, ...prev]);
      } else {
        setClients(prev => prev.map(c => c.email === fEmail ? { ...c, name: fName, clientName: fClientName } : c));
      }
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 14,
    border: '1px solid #d4dbe2', borderRadius: 8,
    boxSizing: 'border-box', fontFamily: 'inherit', color: '#111c28',
    background: '#fff', outline: 'none',
  };

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', overflow: 'hidden' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px', borderBottom: '1px solid #e7ebef', background: '#fff', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111c28' }}>Clients</div>
            <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 2 }}>{clients.length} portal account{clients.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={openNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#FF6000', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{width:15,height:15}}><path d="M12 5v14M5 12h14"/></svg>
            New client
          </button>
        </div>

        <div style={{ margin: '16px 28px 0', background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const, flexShrink: 0 }}>
          {[
            { color: '#7B68EE', label: '"Create portal account" checked in ClickUp' },
            { color: '#FF6000', label: 'Portal account auto-created' },
            { color: '#1FA855', label: 'Magic-link invite sent' },
          ].map(({ color, label }, i, arr) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <span style={{ fontSize: 13, color: '#54616f', fontWeight: 500 }}>{label}</span>
              {i < arr.length - 1 && (
                <svg viewBox="0 0 24 24" fill="none" stroke="#d4dbe2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:16,height:16,marginLeft:4}}><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              )}
            </div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '16px 28px 28px' }}>
          <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e7ebef' }}>
                  {['Client', 'ClickUp name', 'Status', 'Email verified', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left' as const, fontSize: 12, fontWeight: 600, color: '#8b97a4', fontFamily: 'inherit' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: '40px 16px', textAlign: 'center' as const, color: '#8b97a4', fontSize: 14 }}>No client accounts yet. Create one above.</td></tr>
                )}
                {clients.map((c, i) => {
                  const st = statusFor(c);
                  return (
                    <tr key={c.id} onClick={() => openEdit(c)} style={{ borderBottom: i < clients.length - 1 ? '1px solid #f4f6f8' : 'none', cursor: 'pointer', background: selected?.id === c.id ? '#fff8f5' : 'transparent' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ width: 32, height: 32, borderRadius: '50%', background: avatarColor(c.id), color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{initials(c.name)}</span>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111c28' }}>{c.name}</div>
                            <div style={{ fontSize: 12, color: '#8b97a4' }}>{c.email}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: c.clientName ? '#111c28' : '#8b97a4', fontStyle: c.clientName ? 'normal' : 'italic' }}>{c.clientName ?? 'Not set'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 100, color: st.color, background: st.bg }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.color }} />{st.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: c.emailVerified ? '#14805f' : '#8b97a4', fontSize: 13 }}>{c.emailVerified ? '✓ Verified' : '—'}</td>
                      <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 13, color: '#FF6000', fontWeight: 600 }}>Edit →</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(17,28,40,.3)', zIndex: 40 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, background: '#fff', boxShadow: '-8px 0 32px rgba(17,28,40,.12)', zIndex: 50, display: 'flex', flexDirection: 'column', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e7ebef', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#111c28', margin: 0 }}>{selected ? selected.name : 'New client'}</h3>
                <div style={{ fontSize: 13, color: '#8b97a4', marginTop: 3 }}>{selected ? `Client · ${selected.email}` : 'Create a portal account'}</div>
              </div>
              <button onClick={() => setDrawerOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#54616f', padding: 4 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:18,height:18}}><path d="M18 6 6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#54616f', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Full name</label>
                <input value={fName} onChange={e => setFName(e.target.value)} placeholder="Dana Marlowe" style={inp} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#54616f', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Email</label>
                <input type="email" value={fEmail} onChange={e => setFEmail(e.target.value)} placeholder="client@example.com" style={inp} disabled={!!selected} />
                {selected && <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 4 }}>Email cannot be changed after creation.</div>}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#54616f', marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>ClickUp client name</label>
                <input value={fClientName} onChange={e => setFClientName(e.target.value)} placeholder="Ohr Shlomo" style={inp} />
                <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 5 }}>Must match the "Client Name (AM)" field in ClickUp exactly.</div>
              </div>

              {selected && (
                <div style={{ background: selected.emailVerified ? '#e6f4ee' : '#fdf3e1', border: `1px solid ${selected.emailVerified ? '#b8dece' : '#f5dea3'}`, borderRadius: 10, padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={selected.emailVerified ? '#14805f' : '#b06f06'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15,marginTop:1,flexShrink:0}}>
                    {selected.emailVerified ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/></> : <><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></>}
                  </svg>
                  <div style={{ fontSize: 13, color: selected.emailVerified ? '#14805f' : '#b06f06' }}>
                    {selected.emailVerified ? 'Portal access active — client has logged in.' : 'Invite not yet accepted. Send them the login link.'}
                  </div>
                </div>
              )}

              <div style={{ background: '#f4f6f8', borderRadius: 10, padding: '12px 14px' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#54616f', marginBottom: 6 }}>Magic link login</div>
                <div style={{ fontSize: 13, color: '#111c28', fontFamily: 'monospace', background: '#fff', border: '1px solid #e7ebef', borderRadius: 6, padding: '6px 10px' }}>lbm-client-portal.netlify.app/login</div>
                <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 6 }}>Share this URL — client enters their email and gets a magic link.</div>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid #e7ebef', display: 'flex', alignItems: 'center', gap: 10 }}>
              {saveMsg && <span style={{ flex: 1, fontSize: 13, color: saveMsg.includes('rror') || saveMsg.includes('ail') ? '#cf3f36' : '#14805f' }}>{saveMsg}</span>}
              {!saveMsg && <span style={{ flex: 1 }} />}
              <button onClick={() => setDrawerOpen(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #d4dbe2', background: '#fff', color: '#54616f', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={save} disabled={saving || !fEmail || !fName || !fClientName} style={{ padding: '9px 20px', borderRadius: 8, border: 'none', background: saving || !fEmail || !fName || !fClientName ? '#eef1f4' : '#FF6000', color: saving || !fEmail || !fName || !fClientName ? '#8b97a4' : '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
                {saving ? 'Saving…' : selected ? 'Save changes' : 'Create client'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
