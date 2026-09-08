// Automatic Suspense boundary for app/client/videos/[id]/page.tsx. There was
// no loading.tsx here at all — every "Watch & review" click left the browser
// on a blank screen for the whole DB + ClickUp render before the Frame.io
// iframe (itself slow to boot — see FrameioEmbed.tsx) even started loading.
// Mirrors the page's own vd-shell layout closely enough that nothing jumps
// once the real content swaps in.

function Skel({ style }: { style?: React.CSSProperties }) {
  return <div className="skel" style={style} />;
}

export default function VideoDetailLoading() {
  return (
    <main className="vd-shell">
      <div className="vd-mobile-header">
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#fff', border: '1px solid #ece4d8' }} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Skel style={{ height: 14, width: '60%' }} />
          <Skel style={{ height: 10, width: 90 }} />
        </div>
        <div style={{ width: 36, flexShrink: 0 }} />
      </div>

      <div className="vd-video-panel" style={{ position: 'relative', flex: 1 }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #2c3540, #4a5562)' }}>
          <div className="spinner" />
        </div>
      </div>

      <div className="vd-right">
        <div className="vd-right-scroll">
          <div className="vd-meta" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Skel style={{ height: 20, width: '80%' }} />
            <Skel style={{ height: 12, width: '40%' }} />
          </div>
        </div>
        <div className="vd-dock">
          <Skel style={{ height: 44, borderRadius: 12 }} />
        </div>
      </div>
    </main>
  );
}
