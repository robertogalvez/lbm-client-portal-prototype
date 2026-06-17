'use client';

import { useState } from 'react';

type State = 'idle' | 'loading' | 'success' | 'error';

export function CreateClientForm() {
  const [email, setEmail]           = useState('');
  const [name, setName]             = useState('');
  const [clientName, setClientName] = useState('');
  const [state, setState]           = useState<State>('idle');
  const [message, setMessage]       = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setMessage('');
    try {
      const res = await fetch('/api/admin/create-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, clientName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setState('success');
      setMessage(
        data.action === 'created'
          ? `Created client account for ${email}`
          : `Updated existing account for ${email} → role=client, clientName="${clientName}"`
      );
      setEmail(''); setName(''); setClientName('');
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Something went wrong');
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 14,
    border: '1px solid #d4dbe2', borderRadius: 8, outline: 'none',
    boxSizing: 'border-box', fontFamily: 'inherit', color: '#111c28',
    background: '#fff',
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111c28', marginBottom: 5 }}>
          Email address
        </label>
        <input
          type="email" required value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="client@example.com"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111c28', marginBottom: 5 }}>
          Full name
        </label>
        <input
          type="text" required value={name}
          onChange={e => setName(e.target.value)}
          placeholder="John Smith"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111c28', marginBottom: 5 }}>
          Client name <span style={{ fontWeight: 400, color: '#8b97a4' }}>(must match ClickUp exactly)</span>
        </label>
        <input
          type="text" required value={clientName}
          onChange={e => setClientName(e.target.value)}
          placeholder="Ohr Shlomo"
          style={inputStyle}
        />
        <p style={{ fontSize: 12, color: '#8b97a4', margin: '5px 0 0' }}>
          This must exactly match the "Client Name (AM)" dropdown value in ClickUp.
        </p>
      </div>

      {state === 'success' && (
        <div style={{ background: '#e8f5ee', border: '1px solid #b8dece', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#1a6b42' }}>
          ✓ {message}
          <div style={{ marginTop: 6, fontSize: 12, color: '#2d8a57' }}>
            Send the client a magic link login from{' '}
            <strong>lbm-client-portal.netlify.app/login</strong>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: '#cf3f36' }}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        style={{
          padding: '11px 20px', borderRadius: 8, border: 'none',
          background: state === 'loading' ? '#eef1f4' : '#FF6000',
          color: state === 'loading' ? '#8b97a4' : '#fff',
          fontWeight: 600, fontSize: 14,
          cursor: state === 'loading' ? 'not-allowed' : 'pointer',
        }}
      >
        {state === 'loading' ? 'Creating…' : 'Create client account'}
      </button>
    </form>
  );
}
