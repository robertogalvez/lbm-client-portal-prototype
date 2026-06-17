'use client';

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

type State = 'idle' | 'loading' | 'sent' | 'error';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState('loading');
    setError('');
    try {
      await authClient.signIn.magicLink({ email, callbackURL: '/dashboard' });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#101a26',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: '48px 40px',
        width: '100%', maxWidth: 400, boxShadow: '0 10px 34px rgba(0,0,0,.2)',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <span style={{
            fontWeight: 800, fontSize: 22, letterSpacing: '-0.02em',
            background: 'linear-gradient(100deg, #FF6000 0%, #FF3D14 55%, #F5232B 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            backgroundClip: 'text', display: 'block',
          }}>
            Legacy Building Media
          </span>
          <span style={{ fontSize: 12, color: '#8b97a4', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Operations Portal
          </span>
        </div>

        {state === 'sent' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📬</div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: '#111c28', margin: '0 0 8px' }}>
              Check your email
            </h2>
            <p style={{ fontSize: 14, color: '#54616f', lineHeight: 1.6, margin: 0 }}>
              We sent a login link to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111c28', marginBottom: 6 }}>
              Email address
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@legacybuildingmedia.com"
              required
              style={{
                width: '100%', padding: '10px 12px', fontSize: 14,
                border: '1px solid #d4dbe2', borderRadius: 8, outline: 'none',
                boxSizing: 'border-box', marginBottom: 16,
                fontFamily: 'inherit', color: '#111c28',
              }}
              onFocus={e => { e.target.style.borderColor = '#FF6000'; }}
              onBlur={e => { e.target.style.borderColor = '#d4dbe2'; }}
            />

            {state === 'error' && (
              <div style={{
                background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 6,
                padding: '8px 12px', fontSize: 13, color: '#cf3f36', marginBottom: 12,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={state === 'loading'}
              style={{
                width: '100%', padding: '11px 16px',
                background: state === 'loading' ? '#eef1f4' : '#FF6000',
                color: state === 'loading' ? '#8b97a4' : '#fff',
                border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
                cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                transition: 'background 130ms',
              }}
            >
              {state === 'loading' ? 'Sending…' : 'Send login link'}
            </button>

            <p style={{ fontSize: 12, color: '#8b97a4', textAlign: 'center', margin: '16px 0 0' }}>
              No password needed — we'll email you a secure link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
