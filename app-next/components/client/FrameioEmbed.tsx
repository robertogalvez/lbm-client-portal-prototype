'use client';

import { useState } from 'react';

// The Frame.io iframe itself is what's slow — it's Frame.io's own app booting
// up, not something we can speed up from here — but a blank/frozen-looking
// rectangle while that happens reads as broken. Shows a spinner over it until
// the iframe actually fires `onLoad`, so the wait looks intentional.
export function FrameioEmbed({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      {!loaded && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2c3540, #4a5562)' }}>
          <div className="spinner" />
        </div>
      )}
      <iframe
        src={src}
        onLoad={() => setLoaded(true)}
        style={{ width: '100%', height: '100%', border: 'none', display: 'block', position: 'absolute', inset: 0, opacity: loaded ? 1 : 0, transition: 'opacity 200ms' }}
        allow="fullscreen; picture-in-picture"
        allowFullScreen
      />
    </>
  );
}
