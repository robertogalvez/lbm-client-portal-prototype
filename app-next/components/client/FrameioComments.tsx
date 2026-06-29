'use client';

import { useState, useEffect, useCallback } from 'react';

interface Comment {
  id: string;
  text: string;
  timestamp: number | null;
  author: string;
  createdAt: string;
  replies: Comment[];
}

function fmtTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function fmtRelative(iso: string) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function CommentBubble({ c }: { c: Comment }) {
  const initials = c.author.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ background: '#f7f2ea', borderRadius: 10, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#3a4550', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
            {initials}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: '#221e18' }}>{c.author}</span>
          {c.timestamp != null && (
            <span style={{ fontSize: 10.5, fontWeight: 600, color: '#5b6bff', background: '#ebebff', borderRadius: 5, padding: '1px 5px' }}>
              {fmtTimestamp(c.timestamp)}
            </span>
          )}
          <span style={{ fontSize: 10.5, color: '#9d9488', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {fmtRelative(c.createdAt)}
          </span>
        </div>
        <p style={{ fontSize: 13, color: '#6c6357', margin: 0, lineHeight: 1.45 }}>{c.text}</p>
      </div>
      {c.replies.length > 0 && (
        <div style={{ paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '2px solid #ece4d8' }}>
          {c.replies.map(r => <CommentBubble key={r.id} c={r} />)}
        </div>
      )}
    </div>
  );
}

interface Props {
  frameLink: string;
  taskId: string;
}

export function FrameioComments({ frameLink, taskId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/frameio/comments?frameLink=${encodeURIComponent(frameLink)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load comments');
      setComments(data.comments ?? []);
      setAssetId(data.assetId ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, [frameLink]);

  useEffect(() => { load(); }, [load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || !assetId) return;
    setPosting(true);
    setPostError(null);
    try {
      const res = await fetch('/api/client/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, frameioAssetId: assetId, text: text.trim() }),
      });
      if (!res.ok) throw new Error('Failed to post comment');
      setText('');
      await load();
    } catch (e) {
      setPostError(e instanceof Error ? e.message : 'Failed to post');
    } finally {
      setPosting(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#9d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Comments
        </span>
        {!loading && (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#5b6bff', background: '#ebebff', borderRadius: 20, padding: '1px 7px' }}>
            {comments.length}
          </span>
        )}
        <button
          onClick={load}
          style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9d9488', display: 'flex', alignItems: 'center' }}
          title="Refresh comments"
          aria-label="Refresh comments"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
      </div>

      {loading && (
        <div style={{ fontSize: 12, color: '#9d9488', padding: '8px 0' }}>Loading comments…</div>
      )}

      {error && !loading && (
        <div style={{ fontSize: 12, color: '#c0392b', background: '#fdf0ee', borderRadius: 8, padding: '8px 10px' }}>
          {error}
        </div>
      )}

      {!loading && !error && comments.length === 0 && (
        <div style={{ fontSize: 13, color: '#9d9488' }}>No comments yet. Be the first to leave feedback.</div>
      )}

      {!loading && comments.map(c => <CommentBubble key={c.id} c={c} />)}

      {/* Post form — only shown when we have a resolved asset ID */}
      {assetId && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Leave a comment…"
            rows={3}
            style={{
              width: '100%', border: '1px solid #ece4d8', borderRadius: 10,
              padding: '10px 12px', fontSize: 13, color: '#221e18',
              background: '#fff', resize: 'vertical', outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          {postError && (
            <div style={{ fontSize: 11, color: '#c0392b' }}>{postError}</div>
          )}
          <button
            type="submit"
            disabled={!text.trim() || posting}
            style={{
              alignSelf: 'flex-end', background: '#221e18', color: '#fff',
              border: 'none', borderRadius: 10, padding: '8px 18px',
              fontSize: 13, fontWeight: 700,
              cursor: !text.trim() || posting ? 'not-allowed' : 'pointer',
              opacity: !text.trim() || posting ? 0.4 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            {posting ? 'Posting…' : 'Post comment'}
          </button>
        </form>
      )}

      {!assetId && !loading && !error && (
        <div style={{ fontSize: 11, color: '#9d9488' }}>
          Comment posting requires a Frame.io link with a valid review URL.
        </div>
      )}
    </div>
  );
}
