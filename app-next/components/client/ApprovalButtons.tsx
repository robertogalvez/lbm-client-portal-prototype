'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useVideoDecision } from './VideoDecisionContext';
import { useVideoPlayerOptional } from './VideoPlayerContext';

interface Props {
  taskId: string;
  currentApproval: string | null;
}

type Stage =
  | 'idle'      // two buttons: Request changes / Approve
  | 'picker'    // three-outcome picker (shown when notes exist and client taps Approve)
  | 'changes'   // free-text input for requesting changes
  | 'loading'   // waiting for /api/client/approve
  | 'undoable'  // decision stored — 30 s undo window
  | 'done'      // executed — show permanent badge
  | 'error';

export function ApprovalButtons({ taskId, currentApproval }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<string | null>(currentApproval);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [undoAction, setUndoAction] = useState<string>('');
  const [countdown, setCountdown] = useState(30);
  const inFlight = useRef(false);
  const executeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { markDecided } = useVideoDecision();
  const player = useVideoPlayerOptional();
  const comments = player?.comments ?? [];

  const hasNotes = comments.length > 0;

  // Build checklist items from VideoPlayerContext comments
  const noteItems = comments.map(c => {
    const prefix = c.timestampLabel ? `${c.timestampLabel} — ` : '';
    return `${prefix}${c.text}`;
  });

  function clearTimers() {
    if (executeTimerRef.current) { clearTimeout(executeTimerRef.current); executeTimerRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  useEffect(() => () => clearTimers(), []);

  // Dismiss the picker sheet/modal on Escape.
  useEffect(() => {
    if (stage !== 'picker') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setStage('idle');
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [stage]);

  async function submitDecision(action: 'approve' | 'approve_with_fixes' | 'changes', extra?: { feedbackText?: string; noteItems?: string[] }) {
    if (inFlight.current) return;
    inFlight.current = true;
    setStage('loading');
    setError('');
    try {
      const res = await fetch('/api/client/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, action, ...extra }),
      });
      const data = await res.json() as { decisionId?: string; error?: string; message?: string };
      if (!res.ok) throw new Error(data.error ?? data.message ?? 'Request failed');

      const did = data.decisionId!;
      setDecisionId(did);
      setUndoAction(action);

      const actionLabel = action === 'approve' ? 'Approved · posting as is'
        : action === 'approve_with_fixes' ? 'Approved · fixes queued'
        : 'Changes requested';
      setResult(actionLabel);
      setStage('undoable');
      setCountdown(30);

      countdownRef.current = setInterval(() => {
        setCountdown(n => {
          if (n <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; }
          return n - 1;
        });
      }, 1000);

      executeTimerRef.current = setTimeout(async () => {
        await runExecute(did);
      }, 30_000);

    } catch (e) {
      inFlight.current = false;
      setError(e instanceof Error ? e.message : 'Something went wrong');
      setStage('idle');
    }
  }

  async function runExecute(did: string) {
    try {
      const res = await fetch('/api/client/approve/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId: did }),
      });
      if (res.ok) {
        setStage('done');
        markDecided();
      }
      // If execute fails, the pending_decisions row stays for the sync job to pick up
    } catch { /* sync will handle it */ }
  }

  async function handleUndo() {
    clearTimers();
    try {
      await fetch('/api/client/approve/undo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decisionId }),
      });
    } catch { /* best-effort */ }
    inFlight.current = false;
    setDecisionId(null);
    setResult(null);
    setStage('idle');
    setCountdown(30);
    setError('');
  }

  // ── Already decided: permanent badge ─────────────────────────────────────
  if (stage === 'done' || (result && stage === 'idle')) {
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
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
          {approved
            ? <path d="M20 6 9 17l-5-5" />
            : changed
            ? <><path d="M18 6 6 18" /><path d="M6 6l12 12" /></>
            : <circle cx="12" cy="12" r="9" />}
        </svg>
        {result || 'Pending'}
      </div>
    );
  }

  // ── 30-second undo window — one bar: message left, Undo right ────────────
  if (stage === 'undoable') {
    const isApprove = undoAction === 'approve';
    const isWithFixes = undoAction === 'approve_with_fixes';
    const bg = isApprove ? '#e4f3ec' : isWithFixes ? '#fff8e6' : '#fbe7e2';
    const ink = isApprove ? '#14805f' : isWithFixes ? '#8a6200' : '#cf3f36';
    const primary = isApprove ? 'Approved — sending to the team'
      : isWithFixes ? 'Approved · fixes queued for team'
      : 'Changes requested — sending to the team';
    return (
      <div style={{ padding: '12px 14px', borderRadius: 13, background: bg, display: 'flex', alignItems: 'center', gap: 10 }}>
        <svg viewBox="0 0 24 24" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 17, height: 17, flexShrink: 0 }}>
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: ink }}>{primary}</div>
          <div style={{ fontSize: 11, color: ink, opacity: 0.75 }}>in {countdown}s</div>
        </div>
        <button
          type="button"
          onClick={handleUndo}
          style={{
            flexShrink: 0, minHeight: 44, padding: '10px 14px', borderRadius: 9,
            border: `1.5px solid ${ink}`, background: 'transparent', color: ink,
            fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Undo
        </button>
      </div>
    );
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div style={{
        padding: '12px 14px', borderRadius: 13, background: '#f5f2ef',
        color: '#9d9488', fontWeight: 600, fontSize: 14, textAlign: 'center',
      }}>
        Saving…
      </div>
    );
  }

  // ── Three-outcome picker — bottom sheet <900px, centred modal ≥900px ─────
  if (stage === 'picker') {
    const optionStyle = (selected: boolean): React.CSSProperties => ({
      minHeight: 48, padding: '12px 16px', borderRadius: 13,
      border: selected ? '1.5px solid #14805f' : '1px solid #ddd3c6',
      background: selected ? '#f2f9f6' : '#fff',
      color: selected ? '#14805f' : '#221e18',
      fontWeight: 700, fontSize: 14, textAlign: 'left' as const,
      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
      display: 'flex', flexDirection: 'column' as const, gap: 3,
    });

    const sheet = (
      <div className="ab-picker-scrim" onClick={() => setStage('idle')}>
        <div className="ab-picker-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="ab-picker-handle" aria-hidden="true" />
          {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
          <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#221e18' }}>
            You have {comments.length} note{comments.length !== 1 ? 's' : ''}. What should happen to them?
          </p>

          <button type="button" onClick={() => submitDecision('approve_with_fixes', { noteItems })} style={optionStyle(true)}>
            <span>Apply my notes, then post</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: '#9d9488' }}>
              Held until the fixes are done, then it comes back to you to confirm.
            </span>
          </button>

          <button type="button" onClick={() => submitDecision('approve', {})} style={optionStyle(false)}>
            <span>Post as is — my notes are just FYI</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: '#9d9488' }}>
              Team sees your notes as context for future videos. This one goes live now.
            </span>
          </button>

          <button type="button" onClick={() => setStage('changes')} style={optionStyle(false)}>
            <span>Actually, send it back for changes</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: '#9d9488' }}>
              A new editing round starts. You&apos;ll review again when it&apos;s ready.
            </span>
          </button>

          <button
            type="button"
            onClick={() => setStage('idle')}
            style={{
              minHeight: 44, padding: '11px 14px', borderRadius: 13,
              border: '1px solid #ece4d8', background: '#fff',
              color: '#6c6357', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(sheet, document.body) : null;
  }

  // ── Changes request: optional free text ──────────────────────────────────
  if (stage === 'changes') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
        <textarea
          autoFocus
          placeholder="What needs to change? (optional — your timestamped notes are already included)"
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={3}
          style={{
            width: '100%', boxSizing: 'border-box' as const,
            padding: '10px 12px', borderRadius: 10,
            border: '1px solid #e0d8ce', background: '#faf6f0',
            fontSize: 14, color: '#221e18', lineHeight: 1.5,
            fontFamily: 'inherit', resize: 'vertical' as const, outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 9 }}>
          <button
            type="button"
            onClick={() => { setStage(hasNotes ? 'picker' : 'idle'); setFeedback(''); setError(''); }}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 13,
              border: '1px solid #ece4d8', background: '#fff',
              color: '#6c6357', fontWeight: 600, fontSize: 13,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => submitDecision('changes', { feedbackText: feedback.trim() || undefined })}
            style={{
              flex: 2, padding: '11px 14px', borderRadius: 13, border: '1.5px solid #cf3f36',
              background: '#fbe7e2', color: '#a8302a',
              fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Request changes
          </button>
        </div>
      </div>
    );
  }

  // ── Default: two action buttons ───────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}

      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: '#9d9488', fontWeight: 600 }}>
        Your team is notified either way
      </p>

      <div className="ab-verdicts">
        <button
          type="button"
          onClick={() => setStage('changes')}
          className="ab-verdict-changes"
          style={{
            flex: 1, minHeight: 48, padding: '12px 14px', borderRadius: 13,
            border: '1.5px solid #cf3f36', background: '#fbe7e2',
            color: '#a8302a', fontWeight: 700, fontSize: 14,
            cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontFamily: 'inherit',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <path d="M18 6 6 18" /><path d="M6 6l12 12" />
          </svg>
          Request changes
        </button>

        <button
          type="button"
          onClick={() => hasNotes ? setStage('picker') : submitDecision('approve', {})}
          className="ab-verdict-approve"
          style={{
            flex: 1, minHeight: 48, padding: '12px 14px', borderRadius: 13,
            border: '1.5px solid #14805f', background: '#14805f',
            color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            fontFamily: 'inherit',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Approve
        </button>
      </div>
    </div>
  );
}
