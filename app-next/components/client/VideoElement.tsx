'use client';

import { useVideoPlayer } from './VideoPlayerContext';

export function VideoElement({ src }: { src: string }) {
  const { videoRef } = useVideoPlayer();
  return (
    <div className="vd-native-video-wrap">
      <video ref={videoRef} src={src} controls />
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
  );
}
