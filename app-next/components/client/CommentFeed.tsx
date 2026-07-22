'use client';

import { useVideoPlayer } from './VideoPlayerContext';

export function CommentFeed() {
  const { comments, seekTo } = useVideoPlayer();

  if (comments.length === 0) {
    return <p style={{ fontSize: 12, color: '#9d9488', textAlign: 'center', padding: '16px 0' }}>No comments yet</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
  );
}
