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
      await authClient.signIn.magicLink({ email, callbackURL: '/' });
      setState('sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setState('error');
    }
  }

  return (
    <div className="login-shell">
      {/* Left panel — login form */}
      <div className="login-left">
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: 'linear-gradient(135deg, #FF6000 0%, #F5232B 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M3 14V4l6 5 6-5v10" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span style={{
            fontWeight: 700,
            fontSize: 15,
            color: '#fff',
            letterSpacing: '-0.01em',
          }}>
            lbm portal
          </span>
        </div>

        {/* Form area */}
        <div style={{ maxWidth: 360, width: '100%', margin: '0 auto' }}>
          {state === 'sent' ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(255,96,0,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 20px',
              }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 8l9 6 9-6M3 8v10a1 1 0 001 1h16a1 1 0 001-1V8M3 8a1 1 0 011-1h16a1 1 0 011 1" stroke="#FF6000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', margin: '0 0 10px' }}>
                Check your email
              </h2>
              <p style={{ fontSize: 14, color: '#888', lineHeight: 1.6, margin: 0 }}>
                We sent a login link to <span style={{ color: '#ccc' }}>{email}</span>.
                It expires in 10 minutes.
              </p>
              <button
                onClick={() => { setState('idle'); setEmail(''); }}
                style={{
                  marginTop: 24,
                  background: 'transparent',
                  border: '1px solid #2a2a2e',
                  color: '#aaa',
                  borderRadius: 8,
                  padding: '9px 20px',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 32 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
                  Login to your account
                </h1>
                <p style={{ fontSize: 14, color: '#666', margin: 0 }}>
                  Enter your details to login.
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Email input */}
                <input
                  id="email-input"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  required
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    fontSize: 16,
                    background: '#18181b',
                    border: '1px solid #2a2a2e',
                    borderRadius: 8,
                    outline: 'none',
                    boxSizing: 'border-box',
                    color: '#e4e4e7',
                    fontFamily: 'inherit',
                  }}
                  onFocus={e => { e.target.style.borderColor = '#FF6000'; }}
                  onBlur={e => { e.target.style.borderColor = '#2a2a2e'; }}
                />

                {state === 'error' && (
                  <div style={{
                    background: 'rgba(245,35,43,0.1)',
                    border: '1px solid rgba(245,35,43,0.3)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    fontSize: 13,
                    color: '#f87171',
                  }}>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={state === 'loading'}
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    background: state === 'loading' ? '#2a2a2e' : 'linear-gradient(135deg, #FF6000 0%, #F5232B 100%)',
                    color: state === 'loading' ? '#555' : '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: state === 'loading' ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                    transition: 'opacity 130ms',
                  }}
                >
                  {state === 'loading' ? 'Sending…' : 'Sign in with magic link'}
                </button>

                <p style={{ fontSize: 12, color: '#555', textAlign: 'center', margin: '4px 0 0' }}>
                  No password needed — we'll email you a secure link.
                </p>
              </form>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#3a3a3e' }}>
            © 2026 Legacy Building Media
          </span>
          <span style={{ fontSize: 12, color: '#3a3a3e' }}>
            English
          </span>
        </div>
      </div>

      {/* Right panel — brand visual (hidden on mobile, see .login-right) */}
      <div className="login-right">
        {/* Background glow */}
        <div style={{
          position: 'absolute',
          top: '30%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,96,0,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Headline */}
        <div style={{ textAlign: 'center', maxWidth: 480, position: 'relative', zIndex: 1 }}>
          <h2 style={{
            fontSize: 42,
            fontWeight: 800,
            color: '#fff',
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            margin: '0 0 20px',
          }}>
            Your video operations,{' '}
            <span style={{
              background: 'linear-gradient(100deg, #FF6000 0%, #F5232B 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              finally in one place
            </span>
            .
          </h2>
          <p style={{ fontSize: 16, color: '#555', lineHeight: 1.7, margin: 0 }}>
            Track projects, review deliverables, and collaborate with your team — all from a single portal.
          </p>
        </div>

        {/* Hero image */}
        <div style={{
          marginTop: 48,
          width: '100%',
          maxWidth: 560,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://legacybuildingmedia.com/wp-content/uploads/2025/01/podcaster-using-a-laptop.jpg"
            alt="Podcaster using a laptop"
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </div>
      </div>
    </div>
  );
}
