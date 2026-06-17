'use client';

import { useState } from 'react';

interface Props {
  taskId: string;
  currentApproval: string | null;
}

type State = 'idle' | 'loading' | 'done' | 'error';

export function ApprovalButtons({ taskId, currentApproval }: Props) {
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<string | null>(currentApproval);
  const [error, setError] = useState('');

  async function act(action: 'approve' | 'changes') {
    setState('loading');
    setError('');
    try {
      const res = await fetch('/api/client/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Request failed');
      }
      setResult(action === 'approve' ? 'Approved' : 'Changes Requested');
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setState('error');
    }
  }

  if (state === 'done' || (result && state === 'idle')) {
    const approved = result?.toLowerCase().includes('approv') && !result?.toLowerCase().includes('changes');
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', borderRadius: 8,
        background: approved ? '#e8f5ee' : '#fef4e0',
        fontSize: 13, fontWeight: 600,
        color: approved ? '#30a46c' : '#e59700',
      }}>
        <span>{approved ? '✓' : '✎'}</span>
        {result}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div style={{ fontSize: 12, color: '#cf3f36', marginBottom: 8 }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          onClick={() => act('approve')}
          disabled={state === 'loading'}
          style={{
            flex: 1, padding: '11px 16px', borderRadius: 8, border: 'none',
            background: state === 'loading' ? '#eef1f4' : '#30a46c',
            color: state === 'loading' ? '#8b97a4' : '#fff',
            fontWeight: 600, fontSize: 14, cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          {state === 'loading' ? 'Saving…' : '✓ Approve'}
        </button>
        <button
          onClick={() => act('changes')}
          disabled={state === 'loading'}
          style={{
            flex: 1, padding: '11px 16px', borderRadius: 8,
            border: '1px solid #d4dbe2', background: '#fff',
            color: '#54616f', fontWeight: 600, fontSize: 14,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
          }}
        >
          ✎ Request Changes
        </button>
      </div>
    </div>
  );
}
