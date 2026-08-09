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
  | 'idle'      // one neutral button: "Finish your review"
  | 'picker'    // the single decision surface — all three outcomes + shared textarea
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
  // Nothing pre-selected — Confirm stays disabled until the client actually
  // chooses. A single entry point has no physical separation between
  // outcomes anymore, so this is what stands between a stray tap and an
  // approval (Amendment A §3.1).
  const [selectedOption, setSelectedOption] = useState<PickerOption | null>(null);
  const [sendBackWarningAck, setSendBackWarningAck] = useState(false);
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

  // Dismissal (scrim tap, Back, Escape) is not a decision — the selection and
  // any typed text stay exactly as they were (Amendment A §3.3). Only the
  // stale error from a previous failed attempt is worth clearing on reopen.
  function openPicker() {
    setError('');
    setStage('picker');
  }

  function dismissPicker() {
    setStage('idle');
  }

  // Dismiss the picker sheet/modal on Escape.
  useEffect(() => {
    if (stage !== 'picker') return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') dismissPicker();
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
        return;
      }
      const raw = await res.text();
      let data: { error?: string } = {};
      if (raw) { try { data = JSON.parse(raw); } catch { /* non-JSON body */ } }
      throw new Error(data.error ?? `Something went wrong (${res.status}). Please try again.`);
    } catch (e) {
      // The pending_decisions row is still there (unexecuted) for a retry —
      // reset to idle so the client can reopen the picker and try again
      // instead of staring at a frozen countdown forever.
      inFlight.current = false;
      setResult(null);
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setStage('idle');
    }
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

  // ── The single decision surface — bottom sheet <900px, centred modal ≥900px ─
  // All three outcomes, a shared optional textarea, and a Confirm button that
  // takes the label and colour of whatever is selected (Amendment A).
  if (stage === 'picker') {
    const selectedBg = (color: string) => (color === '#14805f' ? '#f2f9f6' : '#fdf4f3');

    const optionStyle = (selected: boolean, selectedColor: string): React.CSSProperties => ({
      minHeight: 48, padding: '12px 16px', borderRadius: 13,
      border: selected ? `1.5px solid ${selectedColor}` : '1px solid #ddd3c6',
      background: selected ? selectedBg(selectedColor) : '#fff',
      cursor: 'pointer', fontFamily: 'inherit', width: '100%', textAlign: 'left' as const,
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

    function selectOption(value: PickerOption) {
      setSelectedOption(value);
      setSendBackWarningAck(false);
    }

    function OptionRow({ value, titleColor, selectedColor, title, sub }: {
      value: PickerOption; titleColor: string; selectedColor: string; title: string; sub: string;
    }) {
      const selected = selectedOption === value;
      return (
        <button type="button" onClick={() => selectOption(value)} style={optionStyle(selected, selectedColor)}>
          {radio(selected, selectedColor)}
          <span style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left' }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: selected ? selectedColor : titleColor }}>{title}</span>
            <span style={{ fontWeight: 400, fontSize: 12, color: '#9d9488' }}>{sub}</span>
          </span>
        </button>
      );
    }

    const isEmptySendBack = selectedOption === 'changes' && !hasNotes && !feedback.trim();

    function handleConfirm() {
      if (!selectedOption) return;
      // An unexplained return costs a full edit cycle and the editor has to
      // chase the AM — warn once, but let the client proceed anyway
      // (re-shooting something entirely is a legitimate instruction).
      if (isEmptySendBack && !sendBackWarningAck) {
        setSendBackWarningAck(true);
        return;
      }
      const extra = {
        feedbackText: feedback.trim() || undefined,
        noteItems: selectedOption === 'approve_with_fixes' ? noteItems : undefined,
      };
      submitDecision(selectedOption, extra);
    }

    const confirmMeta = !selectedOption
      ? { label: 'Confirm', bg: '#f1ebe1', border: '1.5px solid transparent', color: '#bdb3a5', disabled: true }
      : selectedOption === 'changes'
        ? { label: 'Send back for changes', bg: '#fbe7e2', border: '1.5px solid #cf3f36', color: '#a8302a', disabled: false }
        : { label: selectedOption === 'approve_with_fixes' ? 'Approve & apply notes' : 'Approve & post', bg: '#14805f', border: '1.5px solid #14805f', color: '#fff', disabled: false };

    const textareaPlaceholder = selectedOption === 'changes'
      ? "What needs to change? (optional — your timestamped notes are already included)"
      : "Anything the team should know — your timestamped notes are already included";

    const sheet = (
      <div className="ab-picker-scrim" onClick={dismissPicker}>
        <div className="ab-picker-sheet" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
          <div className="ab-picker-handle" aria-hidden="true" />
          {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
          <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#221e18' }}>Finish your review</p>
          {hasNotes && (
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6c6357' }}>
              Your {comments.length} timestamped note{comments.length !== 1 ? 's' : ''} {comments.length !== 1 ? 'are' : 'is'} included with every option below.
            </p>
          )}

          <OptionRow
            value="approve_with_fixes" titleColor="#221e18" selectedColor="#14805f"
            title="Approve — apply my notes first"
            sub="Held until the fixes are done, then back to you to confirm."
          />
          <OptionRow
            value="approve" titleColor="#221e18" selectedColor="#14805f"
            title="Approve — post as is"
            sub="Goes to the posting queue now. Notes are context for future videos."
          />
          <OptionRow
            value="changes" titleColor="#a8302a" selectedColor="#cf3f36"
            title="Send back for changes"
            sub="Returns to editing, then comes back to you."
          />

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginTop: 4, marginBottom: 6 }}>
              Anything to add? <span style={{ fontWeight: 400, textTransform: 'none' as const, letterSpacing: 'normal' }}>optional</span>
            </div>
            <textarea
              placeholder={textareaPlaceholder}
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
          </div>

          {isEmptySendBack && sendBackWarningAck && (
            <div style={{ fontSize: 12, color: '#a8302a', background: '#fdf4f3', border: '1px solid #f5d0c8', borderRadius: 10, padding: '8px 10px' }}>
              Let the team know what to change, or tap Confirm again to send it back with no note.
            </div>
          )}

          <div style={{ display: 'flex', gap: 9, marginTop: 2 }}>
            <button
              type="button"
              onClick={dismissPicker}
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
              disabled={confirmMeta.disabled}
              style={{
                flex: 2, minHeight: 48, padding: '11px 14px', borderRadius: 13, border: confirmMeta.border,
                background: confirmMeta.bg, color: confirmMeta.color,
                fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
                cursor: confirmMeta.disabled ? 'not-allowed' : 'pointer',
              }}
            >
              {confirmMeta.label}
            </button>
          </div>
        </div>
      </div>
    );
    return typeof document !== 'undefined' ? createPortal(sheet, document.body) : null;
  }

  // ── Default: one neutral button that opens the decision surface ──────────
  // Not green, not red, not orange — it isn't a verdict, it opens the place
  // where verdicts are made. Colouring it would recreate the original bug
  // with one button instead of two (Amendment A §1).
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {error && <div style={{ fontSize: 12, color: '#cf3f36', marginBottom: 8 }}>{error}</div>}
      <button
        type="button"
        onClick={openPicker}
        style={{
          width: '100%', minHeight: 52, padding: 14, borderRadius: 13,
          border: '1.5px solid #221e18', background: '#221e18', color: '#fff',
          fontWeight: 700, fontSize: 14.5, cursor: 'pointer', fontFamily: 'inherit',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        Finish your review
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      </button>
      {hasNotes && (
        <p style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, color: '#9d9488', fontWeight: 600 }}>
          {comments.length} {comments.length === 1 ? 'note' : 'notes'} will be sent with your decision
        </p>
      )}
    </div>
  );
}
