'use client';

import { useVideoPlayer } from './VideoPlayerContext';
import { useVideoDecision } from './VideoDecisionContext';

// mm:ss (or h:mm:ss past an hour) from a raw seconds count — matches the
// floor()-based formatting the server side stores (lib/frameio.ts).
function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function CommentComposer() {
  const { composing, pendingSeconds, text, submitting, error, setText, openComposer, cancelComposer, submitComment } = useVideoPlayer();
  const { decided } = useVideoDecision();

  if (decided) {
    return (
      <div style={{
        width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #ece4d8',
        background: '#f7f2ea', color: '#9d9488', fontWeight: 600, fontSize: 13,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textAlign: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, flexShrink: 0 }}>
          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />
        </svg>
        Feedback submitted — comments are now closed
      </div>
    );
  }

  if (!composing) {
    return (
      <button
        onClick={openComposer}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #ece4d8',
          background: '#f7f2ea', color: '#221e18', fontWeight: 600, fontSize: 13,
          cursor: 'pointer', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Add a comment at this moment
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {error && <div style={{ fontSize: 12, color: '#cf3f36' }}>{error}</div>}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>
        At {fmtTime(pendingSeconds)}
      </div>
      <textarea
        autoFocus
        placeholder="What do you want the team to know about this moment?"
        value={text}
        onChange={e => setText(e.target.value)}
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box' as const,
          padding: '10px 12px', borderRadius: 10,
          border: '1px solid #e0d8ce', background: '#faf6f0',
          fontSize: 14, color: '#221e18', lineHeight: 1.5,
          fontFamily: 'inherit', resize: 'vertical' as const, outline: 'none',
        }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={cancelComposer}
          disabled={submitting}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #ece4d8',
            background: '#fff', color: '#6c6357', fontWeight: 600, fontSize: 13,
            cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          Cancel
        </button>
        <button
          onClick={submitComment}
          disabled={submitting || !text.trim()}
          style={{
            flex: 2, padding: '10px 14px', borderRadius: 10, border: 'none',
            background: submitting || !text.trim() ? '#f5f2ef' : '#FF6000',
            color: submitting || !text.trim() ? '#9d9488' : '#fff',
            fontWeight: 700, fontSize: 13,
            cursor: submitting || !text.trim() ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          }}
        >
          {submitting ? 'Posting…' : 'Post comment'}
        </button>
      </div>
    </div>
  );
}
