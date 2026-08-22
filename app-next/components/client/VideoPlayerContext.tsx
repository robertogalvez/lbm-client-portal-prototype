'use client';

import { createContext, useContext, useRef, useState, type ReactNode, type RefObject } from 'react';

export interface ReviewComment {
  id: string;
  text: string;
  authorName: string | null;
  timestampLabel: string | null;
  createdAt: string | null;
}

// Shared state for the video element, the comment composer, and the comment
// feed — three components that need to render in DIFFERENT parts of the page
// per breakpoint (desktop: grouped with the video in the left column;
// mobile: composer/feed join the scrollable meta panel, video stays pinned
// in its own fixed header area) but all act on the same <video> ref and the
// same comment list. Splitting into a context (rather than one monolithic
// component) is what makes that per-breakpoint placement possible without
// portals.
interface PlayerState {
  videoRef: RefObject<HTMLVideoElement | null>;
  comments: ReviewComment[];
  composing: boolean;
  pendingSeconds: number;
  text: string;
  submitting: boolean;
  error: string;
  setText: (t: string) => void;
  openComposer: () => void;
  cancelComposer: () => void;
  submitComment: () => Promise<void>;
  seekTo: (seconds: number) => void;
}

const PlayerContext = createContext<PlayerState | null>(null);

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

export function VideoPlayerProvider({
  children, taskId, fileId, initialComments,
}: {
  children: ReactNode;
  taskId: string;
  fileId: string;
  initialComments: ReviewComment[];
}) {
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

  function cancelComposer() {
    setComposing(false);
    setText('');
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

      setComments(prev => [
        ...prev,
        {
          id: typeof data.frameioCommentId === 'string' ? data.frameioCommentId : `local-${Date.now()}`,
          text: text.trim(),
          // Same name that got recorded server-side (lib/comment-authors.ts) —
          // matches what a page refresh will show, instead of a generic "You"
          // that would flip to a real name only after reloading.
          authorName: typeof data.authorName === 'string' ? data.authorName : 'You',
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
    <PlayerContext.Provider value={{
      videoRef, comments, composing, pendingSeconds, text, submitting, error,
      setText, openComposer, cancelComposer, submitComment, seekTo,
    }}>
      {children}
    </PlayerContext.Provider>
  );
}

export function useVideoPlayer(): PlayerState {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('useVideoPlayer must be used within a VideoPlayerProvider');
  return ctx;
}

// Safe variant — returns null outside a VideoPlayerProvider.
// Use this in components that may render both inside and outside the provider
// (e.g. ApprovalButtons appears on the main client listing as well as the
// video detail page).
export function useVideoPlayerOptional(): PlayerState | null {
  return useContext(PlayerContext);
}
