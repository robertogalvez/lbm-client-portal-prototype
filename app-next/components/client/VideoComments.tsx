'use client';

import { useState } from 'react';

interface Props {
  taskId: string;
  frameLink: string | null;
}

export function VideoComments({ taskId, frameLink }: Props) {
  const [text, setText] = useState('');
  const [timestamp, setTimestamp] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  function parseTimestamp(val: string): number | undefined {
    if (!val.trim()) return undefined;
    const parts = val.trim().split(':').map(Number);
    if (parts.some(isNaN)) return undefined;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return undefined;
  }

  async function submit() {
    if (!text.trim()) return;
    setSending(true); setError('');
    try {
      const res = await fetch('/api/client/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId,
          text: text.trim(),
          timestampSeconds: parseTimestamp(timestamp),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send');
      setText(''); setTimestamp(''); setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1px solid #ece4d8', borderRadius: 10,
    boxSizing: 'border-box', fontFamily: 'inherit', color: '#221e18',
    background: '#fff', outline: 'none', resize: 'none' as const,
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Comments</div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, color: '#9d9488', background: '#f7f2ea', border: '1px solid #ece4d8', padding: '3px 8px', borderRadius: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: 2, background: '#5b9dff' }} />Synced to Frame.io
        </span>
      </div>

      <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 14, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          style={inp}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#9d9488" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <input
              value={timestamp}
              onChange={e => setTimestamp(e.target.value)}
              placeholder="0:00"
              style={{ ...inp, width: 80, paddingLeft: 28, fontSize: 13 }}
            />
          </div>
          <span style={{ fontSize: 12, color: '#9d9488', flex: 1 }}>Timestamp (optional)</span>
          <button
            onClick={submit}
            disabled={sending || !text.trim()}
            style={{
              padding: '9px 18px', borderRadius: 10, border: 'none',
              background: sending || !text.trim() ? '#f0ebe4' : '#FF6000',
              color: sending || !text.trim() ? '#9d9488' : '#fff',
              fontWeight: 700, fontSize: 14, cursor: sending || !text.trim() ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', flexShrink: 0,
            }}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>

        {sent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#14805f', fontWeight: 600 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{width:14,height:14}}><path d="M20 6 9 17l-5-5"/></svg>
            Comment posted to Frame.io and ClickUp
          </div>
        )}
        {error && <div style={{ fontSize: 13, color: '#cf3f36' }}>{error}</div>}
      </div>

      {frameLink && (
        <a href={frameLink} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, padding: '11px 14px', borderRadius: 13, border: '1px solid #ece4d8', background: '#fff', color: '#6c6357', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          Open in Frame.io for timestamped comments
        </a>
      )}
    </div>
  );
}
