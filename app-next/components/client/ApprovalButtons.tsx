'use client';

import { useState, useRef } from 'react';
import { useVideoDecision } from './VideoDecisionContext';

interface Props {
  taskId: string;
  currentApproval: string | null;
}

type State = 'idle' | 'confirming' | 'revising' | 'loading' | 'done' | 'error';

export function ApprovalButtons({ taskId, currentApproval }: Props) {
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<string | null>(currentApproval);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const { markDecided } = useVideoDecision();
  // setState('loading') does not take effect until the next render, so a fast
  // double-tap on a confirm button fires the request twice. A ref flips
  // synchronously on the first call and blocks the second.
  const inFlight = useRef(false);

  async function approve() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('loading');
    setError('');
    try {
      const res = await fetch('/api/client/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action: 'approve' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Request failed');
      }
      setResult('Approved');
      setState('done');
      markDecided();
    } catch (e) {
      // Released only on failure: a successful decision is final, and the
      // 'done' branch replaces these buttons entirely.
      inFlight.current = false;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setState('idle');
    }
  }

  async function submitChangesRequest() {
    if (inFlight.current) return;
    inFlight.current = true;
    setState('loading');
    setError('');
    try {
      // Request changes in ClickUp — the optional feedback text is folded
      // into the same single combined ClickUp comment as any timestamped
      // comments left in the player (see lib/frameio-comment-sync.ts), not
      // posted separately.
      const approveRes = await fetch('/api/client/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action: 'changes', feedbackText: feedback.trim() || undefined }),
      });
      if (!approveRes.ok) {
        const data = await approveRes.json();
        throw new Error(data.error ?? 'Request failed');
      }
      setResult('Changes Requested');
      setState('done');
      markDecided();
    } catch (e) {
      inFlight.current = false;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setState('revising');
    }
  }

  // Already decided — show badge
  if (state === 'done' || (result && state === 'idle')) {
    const approved = result?.toLowerCase().includes('approv') && !result?.toLowerCase().includes('changes');
    const changed = result?.toLowerCase().includes('change');
    return (
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7,
        padding: '10px 14px', borderRadius: 13,
        background: approved ? '#e4f3ec' : changed ? '#fbe7e2' : '#f4f6f8',
        fontSize: 14, fontWeight: 700,
        color: approved ? '#14805f' : changed ? '#cf3f36' : '#8b97a4',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{width:15,height:15}}>
          {approved
            ? <path d="M20 6 9 17l-5-5"/>
            : changed
            ? <><path d="M18 6 6 18"/><path d="M6 6l12 12"/></>
            : <circle cx="12" cy="12" r="9"/>
          }
        </svg>
        {result || 'Pending'}
      </div>
    );
  }

  // Revision flow — text area + submit
  if (state === 'revising') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
        <textarea
          autoFocus
          placeholder="What needs to change in the video? (optional)"
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box' as const,
            padding: '10px 12px', borderRadius: 10,
            border: '1px solid #e0d8ce', background: '#faf6f0',
            fontSize: 16, color: '#221e18', lineHeight: 1.5,
            fontFamily: 'inherit', resize: 'vertical' as const,
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={() => { setState('idle'); setFeedback(''); setError(''); }}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 13,
              border: '1px solid #ece4d8', background: '#fff',
              color: '#6c6357', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          {/* No disabled prop: once the request starts the component renders
              its 'loading' branch and this button unmounts. The ref guard in
              the handler is what stops a same-tick double click. */}
          <button
            type="button"
            onClick={submitChangesRequest}
            style={{
              flex: 2, padding: '11px 14px', borderRadius: 13, border: 'none',
              background: '#cf3f36',
              color: '#fff',
              fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Request changes
          </button>
        </div>
      </div>
    );
  }

  // Approve confirmation — one extra tap since approval is final and irreversible in the portal
  if (state === 'confirming') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
        <p style={{ margin: 0, textAlign: 'center', fontSize: 13, color: '#221e18', fontWeight: 600 }}>
          Approve this video? This can&apos;t be undone from the portal.
        </p>
        <div style={{ display: 'flex', gap: 9 }}>
          <button
            onClick={() => { setState('idle'); setError(''); }}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 13,
              border: '1px solid #ece4d8', background: '#fff',
              color: '#6c6357', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          {/* See the note on the request-changes button: the ref guard, not a
              disabled prop, is what prevents a duplicate submission here. */}
          <button
            type="button"
            onClick={approve}
            style={{
              flex: 2, padding: '11px 14px', borderRadius: 13, border: 'none',
              background: '#FF6000',
              color: '#fff',
              fontWeight: 700, fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Yes, approve
          </button>
        </div>
      </div>
    );
  }

  // Default — two action buttons
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}

      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: '#9d9488', fontWeight: 600 }}>
        Your decision updates the ClickUp task automatically
      </p>

      <div style={{ display: 'flex', gap: 9 }}>
        <button
          onClick={() => setState('revising')}
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
          onClick={() => setState('confirming')}
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
