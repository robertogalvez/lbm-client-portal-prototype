'use client';

import { useRef, useState } from 'react';

export interface ReviewComment {
  id: string;
  text: string;
  authorName: string | null;
  timestampLabel: string | null;
  createdAt: string | null;
}

interface Props {
  taskId: string;
  fileId: string;
  src: string;
  initialComments: ReviewComment[];
}

// mm:ss (or h:mm:ss past an hour) from a raw seconds count.
function fmtTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function VideoReviewPlayer({ taskId, fileId, src, initialComments }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [comments, setComments] = useState<ReviewComment[]>(initialComments);
  const [composing, setComposing] = useState(false);
  const [pendingSeconds, setPendingSeconds] = useState(0);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function openComposer() {
    const v = videoRef.current;
    setPendingSeconds(v ? v.currentTime : 0);
    v?.pause();
    setComposing(true);
    setError('');
  }

  function seekTo(seconds: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = seconds;
    v.play();
  }

  async function submitComment() {
    if (!text.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/client/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, fileId, text: text.trim(), timestampSeconds: pendingSeconds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to post comment');
      if (data.frameioError) throw new Error('Could not save to Frame.io — please try again');

      setComments(prev => [
        ...prev,
        {
          id: typeof data.frameioCommentId === 'string' ? data.frameioCommentId : `local-${Date.now()}`,
          text: text.trim(),
          authorName: 'You',
          timestampLabel: fmtTime(pendingSeconds),
          createdAt: new Date().toISOString(),
        },
      ]);
      setText('');
      setComposing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ position: 'relative', background: '#000', flexShrink: 0 }}>
        <video ref={videoRef} src={src} controls style={{ width: '100%', display: 'block', maxHeight: '60vh' }} />
        <a
          href={src}
          download
          target="_blank"
          rel="noopener noreferrer"
          title="Download video"
          style={{
            position: 'absolute', top: 10, right: 10,
            width: 34, height: 34, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', textDecoration: 'none',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </a>
      </div>

      <div style={{ padding: '10px 12px', borderBottom: '1px solid #ece4d8' }}>
        {!composing ? (
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
        ) : (
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
                onClick={() => { setComposing(false); setText(''); setError(''); }}
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
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const, padding: '4px 12px 12px' }}>
        {comments.length === 0 ? (
          <p style={{ fontSize: 12, color: '#9d9488', textAlign: 'center', padding: '16px 0' }}>No comments yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 8 }}>
            {comments.map(c => (
              <div
                key={c.id}
                style={{ background: '#f7f2ea', borderRadius: 10, padding: '9px 11px', cursor: c.timestampLabel ? 'pointer' : 'default' }}
                onClick={() => {
                  if (!c.timestampLabel) return;
                  const parts = c.timestampLabel.split(':').map(Number);
                  const secs = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
                  if (!isNaN(secs)) seekTo(secs);
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  {c.timestampLabel && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#b06f06', background: '#fbeecf', borderRadius: 6, padding: '1px 6px' }}>
                      {c.timestampLabel}
                    </span>
                  )}
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#221e18' }}>{c.authorName ?? 'Client'}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: '#6c6357', lineHeight: 1.5 }}>{c.text}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
