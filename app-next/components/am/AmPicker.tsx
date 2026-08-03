'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function AmPicker({ members }: { members: string[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(members[0] ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amName: selected }),
      });
      if (!res.ok) throw new Error('Failed to save');
      router.refresh();
    } catch {
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#f4f6f8',
    }}>
      <div style={{
        background: '#fff',
        border: '1px solid #e7ebef',
        borderRadius: 16,
        padding: '48px 40px',
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{
            width: 48, height: 48,
            background: '#FF6000',
            borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            fontSize: 24,
          }}>👋</div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111c28', margin: '0 0 8px' }}>Welcome!</h1>
          <p style={{ fontSize: 14, color: '#54616f', margin: 0, lineHeight: 1.6 }}>
            Select your name to set up your AM dashboard.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#111c28', marginBottom: 8 }}>
            Your name
          </label>
          <select
            value={selected}
            onChange={e => setSelected(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              border: '1px solid #d1d9e0', borderRadius: 8,
              color: '#111c28', background: '#fff', outline: 'none',
              boxSizing: 'border-box',
            }}
          >
            {members.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {error && (
          <div style={{ background: '#fdedeb', border: '1px solid #f8d0cc', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#cf3f36', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !selected}
          style={{
            width: '100%', padding: '12px',
            background: saving ? '#f4b08a' : '#FF6000',
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {saving ? 'Saving…' : 'Set Up My Dashboard'}
        </button>
      </div>
    </div>
  );
}
