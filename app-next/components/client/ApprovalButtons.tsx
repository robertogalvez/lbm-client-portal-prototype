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
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '10px 14px', borderRadius: 13,
        background: approved ? '#e4f3ec' : '#fbe7e2',
        fontSize: 14, fontWeight: 700,
        color: approved ? '#14805f' : '#cf3f36',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}>
          {approved
            ? <path d="M20 6 9 17l-5-5"/>
            : <><path d="M18 6 6 18"/><path d="M6 6l12 12"/></>
          }
        </svg>
        {result}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}

      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: '#9d9488', fontWeight: 600 }}>
        Your decision updates the ClickUp task automatically
      </p>

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          onClick={() => act('changes')}
          disabled={state === 'loading'}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 13,
            border: '1px solid #fbe7e2', background: '#fbe7e2',
            color: '#cf3f36', fontWeight: 700, fontSize: 14,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontFamily: 'inherit', opacity: state === 'loading' ? 0.5 : 1,
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}>
            <path d="M18 6 6 18"/><path d="M6 6l12 12"/>
          </svg>
          Request changes
        </button>

        <button
          onClick={() => act('approve')}
          disabled={state === 'loading'}
          style={{
            flex: 1, padding: '12px 14px', borderRadius: 13, border: 'none',
            background: state === 'loading' ? '#f5f2ef' : '#FF6000',
            color: state === 'loading' ? '#9d9488' : '#fff',
            fontWeight: 700, fontSize: 14,
            cursor: state === 'loading' ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontFamily: 'inherit',
          }}
        >
          {state === 'loading' ? 'Saving…' : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}>
                <path d="M20 6 9 17l-5-5"/>
              </svg>
              Approve
            </>
          )}
        </button>
      </div>
    </div>
  );
}
