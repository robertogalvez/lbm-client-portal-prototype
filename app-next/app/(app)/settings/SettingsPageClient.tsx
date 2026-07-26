'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date | null;
  isAlsoClient: boolean | null;
  clientName: string | null;
  notifyMethod: string;
  phone: string | null;
}

interface FrameioStatus {
  connected: boolean;
  mode: string;
  needsReauth: boolean;
  daysUntilReauth: number | null;
  reauthDeadline: string | null;
  banner: string | null;
  bannerReason: string | null;
}

interface Props {
  users: User[];
  currentUserId: string;
  frameio: FrameioStatus;
  smsConfigured: boolean;
}

function FrameioConnectionSection({ frameio }: { frameio: FrameioStatus }) {
  const { connected, mode, needsReauth, daysUntilReauth } = frameio;
  const soon = connected && daysUntilReauth !== null && daysUntilReauth <= 5;

  const statusText = mode === 'override'
    ? 'Connected (manual token)'
    : !connected || needsReauth
      ? 'Not connected — authorization required'
      : `Connected · expires in ${daysUntilReauth} day${daysUntilReauth === 1 ? '' : 's'}`;
  const dotColor = (!connected || needsReauth) ? '#e5484d' : soon ? '#e59700' : '#14805f';

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111c28', margin: '0 0 4px' }}>Frame.io connection</h2>
      <p style={{ fontSize: 12.5, color: '#8b97a4', margin: '0 0 12px' }}>
        Required for auto-publishing videos to Vista Social. Frame.io authorization expires periodically — renew below when prompted to keep publishing working.
      </p>

      {frameio.banner === 'connected' && (
        <div style={{ background: '#e4f3ec', border: '1px solid #b7e0c9', color: '#14805f', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          ✓ Frame.io connected successfully.
        </div>
      )}
      {frameio.banner === 'error' && (
        <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', color: '#cf3f36', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 12 }}>
          Frame.io authorization failed{frameio.bannerReason ? `: ${frameio.bannerReason}` : ''}. Please try again.
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#111c28' }}>{statusText}</div>
            {soon && (
              <div style={{ fontSize: 12, color: '#e59700', marginTop: 3 }}>Renew soon to avoid interrupting publishing.</div>
            )}
          </div>
        </div>
        <a
          href="/api/frameio/oauth/start"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600,
            color: '#fff', background: (!connected || needsReauth || soon) ? '#FF6000' : '#54616f',
            borderRadius: 8, padding: '9px 16px', textDecoration: 'none',
          }}
        >
          {connected && !needsReauth ? 'Renew authorization' : 'Connect Frame.io'}
        </a>
      </div>
    </div>
  );
}

type DrawerMode = 'invite' | 'edit';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  account_manager: 'Account Manager',
};

const AVATAR_COLORS = ['#5e6b7a', '#5172c4', '#b58236', '#7c66c4', '#cf5b53', '#14805f', '#b06f06'];

function avatarColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function fmtDate(d: Date | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const SYNC_COOLDOWN_MS = 2 * 60 * 1000;
type SyncState = 'idle' | 'syncing' | 'success' | 'error' | 'cooldown';

function ForceSyncSection() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [syncedCount, setSyncedCount] = useState(0);
  const [lastSync, setLastSync] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem('lbm_last_sync');
    const elapsed = stored ? Date.now() - Number(stored) : Infinity;
    if (elapsed < SYNC_COOLDOWN_MS) {
      setSyncState('cooldown');
      setLastSync(Number(stored));
    }
  }, []);

  useEffect(() => {
    if (syncState !== 'cooldown') return;
    const id = setInterval(() => {
      if (Date.now() - lastSync >= SYNC_COOLDOWN_MS) setSyncState('idle');
    }, 30_000);
    return () => clearInterval(id);
  }, [syncState, lastSync]);

  const handleSync = useCallback(async () => {
    if (syncState !== 'idle') return;
    setSyncState('syncing');
    try {
      const res = await fetch('/api/sync-now', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setSyncState('error'); setTimeout(() => setSyncState('idle'), 5_000); return; }
      setSyncedCount(data.synced ?? 0);
      const now = Date.now();
      localStorage.setItem('lbm_last_sync', now.toString());
      setLastSync(now);
      setSyncState('success');
      startTransition(() => router.refresh());
      setTimeout(() => setSyncState('cooldown'), 5_000);
    } catch {
      setSyncState('error');
      setTimeout(() => setSyncState('idle'), 5_000);
    }
  }, [syncState, router, startTransition]);

  const minsAgo = lastSync ? Math.floor((Date.now() - lastSync) / 60_000) : 0;
  const agoLabel = minsAgo < 1 ? 'just now' : `${minsAgo}m ago`;
  const isDisabled = syncState === 'syncing' || syncState === 'cooldown';

  const btnColor = syncState === 'success' ? '#14805f' : syncState === 'error' ? '#cf3f36' : '#54616f';

  return (
    <div style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#111c28', margin: '0 0 4px' }}>Data sync</h2>
      <p style={{ fontSize: 13, color: '#8b97a4', margin: '0 0 16px', lineHeight: 1.6 }}>
        ClickUp changes sync automatically via webhook in real time — this button is a recovery tool only.
        Use it if the webhook was down, you just reconfigured ClickUp, or you suspect the database is out of sync.
      </p>
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10, padding: '18px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#111c28' }}>Force full resync from ClickUp</div>
          <div style={{ fontSize: 12, color: '#8b97a4', marginTop: 3 }}>
            Fetches every task in the configured ClickUp list and upserts them all into the database.
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={isDisabled}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '9px 16px', borderRadius: 8,
            border: '1px solid #d4dbe2', background: '#fff',
            fontSize: 13, fontWeight: 600, color: btnColor,
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            opacity: syncState === 'cooldown' ? 0.55 : 1,
            flexShrink: 0, whiteSpace: 'nowrap',
            transition: 'opacity 0.2s, color 0.2s',
            fontFamily: 'inherit',
          }}
        >
          {syncState === 'syncing' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, animation: 'lbm-spin 0.8s linear infinite' }}>
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
          ) : syncState === 'success' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><polyline points="20 6 9 17 4 12"/></svg>
          ) : syncState === 'error' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>
            </svg>
          )}
          {syncState === 'idle' && 'Run full resync'}
          {syncState === 'syncing' && 'Syncing…'}
          {syncState === 'success' && `Synced ${syncedCount} tasks`}
          {syncState === 'error' && 'Sync failed — retry'}
          {syncState === 'cooldown' && `Synced ${agoLabel}`}
        </button>
      </div>
      <style>{`@keyframes lbm-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export function SettingsPageClient({ users: initial, currentUserId, frameio, smsConfigured }: Props) {
  const [users, setUsers] = useState<User[]>(initial);
  const [drawer, setDrawer] = useState<{ mode: DrawerMode; user?: User } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [clientOptions, setClientOptions] = useState<{ name: string }[]>([]);

  useEffect(() => {
    fetch('/api/admin/clients')
      .then(r => r.ok ? r.json() : [])
      .then((data: { name: string }[]) => setClientOptions(data.map(c => ({ name: c.name }))))
      .catch(() => {});
  }, []);

  // Form state
  const [form, setForm] = useState({ name: '', email: '', role: 'account_manager', isAlsoClient: false, clientName: '', notifyMethod: 'none', phone: '' });

  function openInvite() {
    setForm({ name: '', email: '', role: 'account_manager', isAlsoClient: false, clientName: '', notifyMethod: 'none', phone: '' });
    setError('');
    setSuccess('');
    setDrawer({ mode: 'invite' });
  }

  function openEdit(user: User) {
    setForm({
      name: user.name, email: user.email, role: user.role,
      isAlsoClient: user.isAlsoClient ?? false, clientName: user.clientName ?? '',
      notifyMethod: user.notifyMethod ?? 'none', phone: user.phone ?? '',
    });
    setError('');
    setSuccess('');
    setDrawer({ mode: 'edit', user });
  }

  function close() {
    setDrawer(null);
    setError('');
    setSuccess('');
  }

  // Escape closes the drawer. Clicking the backdrop was the only pointer-free
  // way out, which is no way out at all without a mouse.
  useEffect(() => {
    if (!drawer) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawer]);

  async function saveInvite() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, role: form.role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setSuccess(data.action === 'created' ? `Invite sent to ${form.email}` : `Updated ${form.email}`);
      // Refresh list
      const listRes = await fetch('/api/admin/list-users');
      if (listRes.ok) setUsers(await listRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function saveRole() {
    if (!drawer?.user) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: drawer.user.id,
          // don't send role when editing yourself — API blocks self role changes
          ...(drawer.user.id !== currentUserId && { role: form.role }),
          isAlsoClient: form.isAlsoClient,
          clientName: form.clientName,
          notifyMethod: form.notifyMethod,
          phone: form.phone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      setUsers(prev => prev.map(u => u.id === drawer.user!.id
        ? { ...u, role: form.role, isAlsoClient: form.isAlsoClient, clientName: form.clientName, notifyMethod: form.notifyMethod, phone: form.phone || null }
        : u));
      setSuccess('Saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(user: User) {
    if (!confirm(`Remove ${user.name} from the portal? They will lose access immediately.`)) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/update-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, deactivate: true }),
      });
      if (!res.ok) throw new Error('Failed');
      setUsers(prev => prev.filter(u => u.id !== user.id));
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 14,
    border: '1px solid #d4dbe2', borderRadius: 8, outline: 'none',
    fontFamily: 'inherit', color: '#111c28', background: '#fff', boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: '#54616f',
    display: 'block', marginBottom: 5,
  };

  return (
    <main className="db-page-pad" style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111c28', margin: 0 }}>Settings</h1>
          <p style={{ fontSize: 13, color: '#8b97a4', margin: '4px 0 0' }}>Manage internal team access and roles</p>
        </div>
        <button
          onClick={openInvite}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: '#FF6000', color: '#fff', fontWeight: 600, fontSize: 13,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Invite user
        </button>
      </div>

      {/* Users table */}
      <div style={{ background: '#fff', border: '1px solid #e7ebef', borderRadius: 10 }} className="db-tscroll">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e7ebef', background: '#f8f9fb' }}>
              {['User', 'Role', 'Status', 'Joined', ''].map(h => (
                <th key={h} style={{
                  textAlign: 'left', padding: '10px 16px',
                  fontWeight: 600, color: '#8b97a4', fontSize: 11,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => {
              const isYou = user.id === currentUserId;
              return (
                <tr key={user.id} style={{ borderBottom: '1px solid #f4f6f8' }}>
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%',
                        background: avatarColor(user.id),
                        color: '#fff', display: 'grid', placeItems: 'center',
                        fontSize: 12, fontWeight: 700, flexShrink: 0,
                      }}>
                        {initials(user.name)}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: '#111c28' }}>
                          {user.name}
                          {isYou && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#8b97a4', background: '#eceef1', borderRadius: 4, padding: '2px 6px' }}>you</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#8b97a4' }}>{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      fontSize: 12, fontWeight: 600, padding: '3px 9px', borderRadius: 6,
                      color: user.role === 'admin' ? '#7c4dff' : '#1090e0',
                      background: user.role === 'admin' ? '#f0ebff' : '#e6f2fc',
                    }}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    {user.emailVerified
                      ? <span style={{ fontSize: 12, fontWeight: 600, color: '#14805f', background: '#e8f5ee', padding: '3px 9px', borderRadius: 6 }}>Active</span>
                      : <span style={{ fontSize: 12, fontWeight: 600, color: '#b06f06', background: '#fef4e0', padding: '3px 9px', borderRadius: 6 }}>Invite sent</span>
                    }
                  </td>
                  <td style={{ padding: '12px 16px', color: '#8b97a4', fontSize: 12 }}>{fmtDate(user.createdAt)}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <button
                      onClick={() => openEdit(user)}
                      style={{
                        fontSize: 12, fontWeight: 600, color: '#54616f',
                        background: 'none', border: '1px solid #d4dbe2',
                        borderRadius: 6, padding: '9px 12px', cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <FrameioConnectionSection frameio={frameio} />

      <ForceSyncSection />

      {/* Drawer overlay. role="presentation" on the backdrop: it is a click-away
          wrapper around the dialog, not a control in its own right. Escape does
          the same job for the keyboard. */}
      {drawer && (
        <div
          role="presentation"
          onClick={close}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
            zIndex: 200, display: 'flex', justifyContent: 'flex-end',
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-drawer-title"
            onClick={e => e.stopPropagation()}
            style={{
              width: 380, maxWidth: '92vw', background: '#fff', height: '100%',
              boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
              display: 'flex', flexDirection: 'column',
            }}
          >
            {/* Drawer header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e7ebef', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div id="settings-drawer-title" style={{ fontSize: 15, fontWeight: 700, color: '#111c28' }}>
                {drawer.mode === 'invite' ? 'Invite team member' : `Edit ${drawer.user?.name}`}
              </div>
              <button type="button" aria-label="Close" onClick={close} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b97a4', padding: 11, margin: -7 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Drawer body */}
            <div style={{ padding: '24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

              {drawer.mode === 'invite' && (
                <>
                  <div>
                    <label htmlFor="member-name" style={labelStyle}>Full name</label>
                    <input
                      id="member-name"
                      style={inputStyle}
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Jane Smith"
                    />
                  </div>
                  <div>
                    <label htmlFor="member-email" style={labelStyle}>Email</label>
                    <input
                      id="member-email"
                      style={inputStyle}
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      placeholder="jane@legacybuildingmedia.com"
                    />
                  </div>
                </>
              )}

              <div>
                <label htmlFor="member-role" style={labelStyle}>Role</label>
                <select
                  id="member-role"
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                >
                  <option value="account_manager">Account Manager</option>
                  <option value="admin">Admin</option>
                </select>
                <p style={{ fontSize: 12, color: '#8b97a4', margin: '6px 0 0', lineHeight: 1.5 }}>
                  {form.role === 'admin'
                    ? 'Full access: CEO dashboard, Settings, client management, and all AM views.'
                    : 'Access to their AM dashboard, client portal, and assigned tasks.'}
                </p>
              </div>

              {drawer.mode === 'edit' && (
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.isAlsoClient}
                      onChange={e => setForm(f => ({ ...f, isAlsoClient: e.target.checked }))}
                      style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#FF6000' }}
                    />
                    Also a client (can access client portal)
                  </label>
                  {form.isAlsoClient && (
                    <div style={{ marginTop: 10 }}>
                      <label htmlFor="member-client-name" style={labelStyle}>Client name</label>
                      <select
                        id="member-client-name"
                        style={{ ...inputStyle, cursor: 'pointer' }}
                        value={form.clientName}
                        onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))}
                      >
                        <option value="">— select client —</option>
                        {clientOptions.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {drawer.mode === 'edit' && form.role === 'account_manager' && (
                <div>
                  <label htmlFor="member-notify-method" style={labelStyle}>Client decision notifications</label>
                  <p style={{ fontSize: 12, color: '#8b97a4', margin: '0 0 8px', lineHeight: 1.5 }}>
                    How this AM is notified when a client approves or requests changes on one of their videos, in addition to the ClickUp task comment.
                  </p>
                  <select
                    id="member-notify-method"
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    value={form.notifyMethod}
                    onChange={e => setForm(f => ({ ...f, notifyMethod: e.target.value }))}
                  >
                    <option value="none">Off</option>
                    <option value="email">Email</option>
                    <option value="sms">SMS</option>
                  </select>

                  {form.notifyMethod === 'sms' && (
                    <div style={{ marginTop: 10 }}>
                      <label htmlFor="member-phone" style={labelStyle}>Phone number</label>
                      <input
                        id="member-phone"
                        style={inputStyle}
                        type="tel"
                        value={form.phone}
                        onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                        placeholder="+1 555 123 4567"
                      />
                      {!smsConfigured && (
                        <p style={{ fontSize: 12, color: '#b06f06', background: '#fef4e0', border: '1px solid #f4e2b0', borderRadius: 8, padding: '9px 12px', margin: '8px 0 0', lineHeight: 1.5 }}>
                          SMS isn&apos;t sending yet — Twilio hasn&apos;t been connected. This preference will start working automatically as soon as it is, no need to revisit this screen.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div style={{ fontSize: 13, color: '#cf3f36', background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '10px 14px' }}>
                  {error}
                </div>
              )}

              {success && (
                <div style={{ fontSize: 13, color: '#14805f', background: '#e8f5ee', border: '1px solid #c3e8d6', borderRadius: 8, padding: '10px 14px' }}>
                  {success}
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e7ebef', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={drawer.mode === 'invite' ? saveInvite : saveRole}
                disabled={saving || (drawer.mode === 'invite' && (!form.name || !form.email)) || (drawer.mode === 'edit' && form.notifyMethod === 'sms' && !form.phone.trim())}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8, border: 'none',
                  background: saving ? '#eceef1' : '#FF6000',
                  color: saving ? '#8b97a4' : '#fff',
                  fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {saving ? 'Saving…' : drawer.mode === 'invite' ? 'Send invite' : 'Save changes'}
              </button>

              {drawer.mode === 'edit' && drawer.user && drawer.user.id !== currentUserId && (
                <button
                  onClick={() => deactivate(drawer.user!)}
                  disabled={saving}
                  style={{
                    width: '100%', padding: '11px', borderRadius: 8,
                    border: '1px solid #f8d0cc', background: '#fff',
                    color: '#cf3f36', fontWeight: 600, fontSize: 13,
                    cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                  }}
                >
                  Remove from portal
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
