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
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }}>
      {/* Left panel — login form */}
      <div style={{
        width: '100%',
        maxWidth: 520,
        background: '#0c0c0e',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '40px 48px',
        flexShrink: 0,
      }}>
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
                {/* Google button */}
                <button
                  type="button"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '11px 16px',
                    background: '#18181b',
                    border: '1px solid #2a2a2e',
                    borderRadius: 8,
                    color: '#e4e4e7',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                    <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                    <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                  </svg>
                  Continue with Google
                </button>

                {/* Email magic link button */}
                <button
                  type="button"
                  onClick={() => {
                    const emailInput = document.getElementById('email-input') as HTMLInputElement;
                    if (emailInput) emailInput.focus();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '11px 16px',
                    background: '#18181b',
                    border: '1px solid #2a2a2e',
                    borderRadius: 8,
                    color: '#e4e4e7',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M2.25 3.75h13.5c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125H2.25A1.125 1.125 0 011.125 13.125v-8.25c0-.621.504-1.125 1.125-1.125z" stroke="#e4e4e7" strokeWidth="1.4" strokeLinejoin="round"/>
                    <path d="M1.125 4.875L9 10.125l7.875-5.25" stroke="#e4e4e7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Continue with email
                </button>

                {/* Divider */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#2a2a2e' }} />
                  <span style={{ fontSize: 12, color: '#555', letterSpacing: '0.04em' }}>OR</span>
                  <div style={{ flex: 1, height: 1, background: '#2a2a2e' }} />
                </div>

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
                    fontSize: 14,
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

      {/* Right panel — brand visual */}
      <div style={{
        flex: 1,
        background: 'linear-gradient(135deg, #0d0d14 0%, #14101a 40%, #1a0d1a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 48px',
        position: 'relative',
        overflow: 'hidden',
      }}>
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

        {/* Mock dashboard card */}
        <div style={{
          marginTop: 48,
          background: '#16161a',
          border: '1px solid #2a2a2e',
          borderRadius: 16,
          width: '100%',
          maxWidth: 520,
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.5)',
          position: 'relative',
          zIndex: 1,
        }}>
          {/* Card header */}
          <div style={{
            padding: '14px 20px',
            borderBottom: '1px solid #2a2a2e',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3a3e' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3a3e' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3a3a3e' }} />
            </div>
            <div style={{ flex: 1, height: 1, background: '#2a2a2e' }} />
            <div style={{
              background: 'rgba(255,96,0,0.15)',
              color: '#FF6000',
              fontSize: 11,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 20,
              border: '1px solid rgba(255,96,0,0.3)',
            }}>
              In Progress
            </div>
          </div>

          {/* Card body */}
          <div style={{ padding: '20px' }}>
            {/* Project rows */}
            {[
              { name: 'Brand Story — Episode 4', status: 'Review', color: '#818cf8' },
              { name: 'Product Launch Ad v2', status: 'Editing', color: '#FF6000' },
              { name: 'Testimonial Series #7', status: 'Done', color: '#34d399' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 0',
                borderBottom: i < 2 ? '1px solid #1e1e22' : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: item.color,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 13, color: '#ccc' }}>{item.name}</span>
                </div>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: item.color,
                  background: `${item.color}1a`,
                  padding: '2px 8px',
                  borderRadius: 20,
                }}>
                  {item.status}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #1e1e22', background: '#111113' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: '#555' }}>Monthly delivery progress</span>
              <span style={{ fontSize: 11, color: '#FF6000', fontWeight: 600 }}>67%</span>
            </div>
            <div style={{ height: 4, background: '#2a2a2e', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: '67%', height: '100%', background: 'linear-gradient(90deg, #FF6000, #F5232B)', borderRadius: 4 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
