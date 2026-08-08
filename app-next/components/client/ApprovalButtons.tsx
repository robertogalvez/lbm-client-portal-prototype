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

type PickerOption = 'approve_with_fixes' | 'approve' | 'changes';

export function ApprovalButtons({ taskId, currentApproval }: Props) {
  const [stage, setStage] = useState<Stage>('idle');
  const [result, setResult] = useState<string | null>(currentApproval);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [selectedOption, setSelectedOption] = useState<PickerOption>('approve_with_fixes');
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

  // Opening the picker always starts from a clean slate — otherwise an error
  // from a previous failed submission (or a stale selection) would still be
  // showing the next time the client reopens it.
  function openPicker() {
    setSelectedOption('approve_with_fixes');
    setError('');
    setStage('picker');
  }

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
      // The server always intends to return JSON, but a crashed/timed-out
      // function can send back an empty or truncated body — res.json()
      // throws "Unexpected end of JSON input" on that, which is not a
      // message a client should ever see. Parse defensively and fall back
      // to a status-based message instead.
      const raw = await res.text();
      let data: { decisionId?: string; error?: string; message?: string } = {};
      if (raw) { try { data = JSON.parse(raw); } catch { /* non-JSON body — fall through */ } }
      if (!res.ok) throw new Error(data.error ?? data.message ?? `Something went wrong (${res.status}). Please try again.`);
      if (!data.decisionId) throw new Error('Something went wrong. Please try again.');

      const did = data.decisionId;
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
  // Select, then Confirm — a client can change their mind before anything is
  // submitted, rather than the first tap committing the choice.
  if (stage === 'picker') {
    // Both "post the video" options highlight green when selected; "send it
    // back" highlights red, matching that action's color everywhere else in
    // the app (the Request changes button, the "Changes requested" badge).
    const selectedBg = (color: string) => (color === '#14805f' ? '#f2f9f6' : '#fdf4f3');

    const optionStyle = (selected: boolean, selectedColor: string): React.CSSProperties => ({
      minHeight: 48, padding: '12px 16px', borderRadius: 13,
      border: selected ? `1.5px solid ${selectedColor}` : '1px solid #ddd3c6',
      background: selected ? selectedBg(selectedColor) : '#fff',
      cursor: 'pointer', fontFamily: 'inherit', width: '100%',
      display: 'flex', flexDirection: 'row' as const, alignItems: 'flex-start', gap: 10,
    });

    const radio = (selected: boolean, color: string) => (
      <span style={{
        width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        border: `2px solid ${selected ? color : '#ddd3c6'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {selected && <span style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />}
      </span>
    );

    function OptionRow({ value, titleColor, selectedColor, title, sub }: {
      value: PickerOption; titleColor: string; selectedColor: string; title: string; sub: string;
    }) {
      const selected = selectedOption === value;
      return (
        <button type="button" onClick={() => setSelectedOption(value)} style={optionStyle(selected, selectedColor)}>
          {radio(selected, selectedColor)}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: selected ? selectedColor : titleColor }}>{title}</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: '#9d9488' }}>{sub}</span>
          </span>
        </button>
      );
    }

    function handleConfirm() {
      if (selectedOption === 'changes') { setStage('changes'); return; }
      submitDecision(selectedOption, selectedOption === 'approve_with_fixes' ? { noteItems } : {});
    }

    const sheet = (
      <div className="ab-picker-scrim" onClick={() => setStage('idle')}>
        <div className="ab-picker-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="ab-picker-handle" aria-hidden="true" />
          {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#221e18' }}>
            You have {comments.length} note{comments.length !== 1 ? 's' : ''}. What should happen to them?
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 13, color: '#9d9488' }}>
            Approving normally sends this straight to the posting queue.
          </p>

          <OptionRow
            value="approve_with_fixes" titleColor="#221e18" selectedColor="#14805f"
            title="Apply my notes, then post"
            sub="Held until the fixes are done, then it comes back to you to confirm."
          />
          <OptionRow
            value="approve" titleColor="#221e18" selectedColor="#14805f"
            title="Post as is — my notes are just FYI"
            sub="Team sees your notes as context for future videos. This one goes live now."
          />
          <OptionRow
            value="changes" titleColor="#a8302a" selectedColor="#cf3f36"
            title="Send it back for changes"
            sub="A new editing round starts. You'll review again when it's ready."
          />

          <div style={{ display: 'flex', gap: 9, marginTop: 2 }}>
            <button
              type="button"
              onClick={() => setStage('idle')}
              style={{
                flex: 1, minHeight: 48, padding: '11px 14px', borderRadius: 13,
                border: '1px solid #ece4d8', background: '#fff',
                color: '#6c6357', fontWeight: 600, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              style={{
                flex: 2, minHeight: 48, padding: '11px 14px', borderRadius: 13, border: '1.5px solid #14805f',
                background: '#14805f', color: '#fff',
                fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Confirm
            </button>
          </div>
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
          onClick={() => hasNotes ? openPicker() : submitDecision('approve', {})}
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
