// Automatic Suspense boundary for app/client/page.tsx (Reviews + Calendar +
// every other tab, since they're all the same route with a ?tab= search
// param — see app/client/page.tsx). Without this, that page's
// force-dynamic, DB + ClickUp + Frame.io-backed render left the browser on
// a blank/frozen screen for the whole navigation, with zero feedback.
// Mirrors the page's own two-layout markup (mobile .cp-shell vs desktop
// .client-desktop — both render, CSS media queries pick one) closely
// enough that nothing jumps once the real content swaps in, but shows no
// real data — tab visibility (Calendar/Invoices/Report) depends on the
// client record we haven't fetched yet, so the nav here is deliberately
// minimal rather than guessing at it.

function Skel({ style }: { style?: React.CSSProperties }) {
  return <div className="skel" style={style} />;
}

function MobileCardSkeleton() {
  return (
    <div style={{ background: '#fff', border: '1px solid #ece4d8', borderRadius: 22, overflow: 'hidden' }}>
      <Skel style={{ aspectRatio: '16/10', borderRadius: 0 }} />
      <div style={{ padding: '13px 15px 15px', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <Skel style={{ height: 16, width: '70%' }} />
        <Skel style={{ height: 12, width: '40%' }} />
        <Skel style={{ height: 40, borderRadius: 15 }} />
      </div>
    </div>
  );
}

function DesktopCardSkeleton() {
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 8px #0001' }}>
      <Skel style={{ paddingTop: '56.25%', borderRadius: 0 }} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Skel style={{ height: 15, width: '75%' }} />
        <Skel style={{ height: 24, borderRadius: 8 }} />
        <Skel style={{ height: 38, borderRadius: 10 }} />
      </div>
    </div>
  );
}

export default function ClientPortalLoading() {
  return (
    <>
      <main className="cp-shell client-mobile">
        <div className="cp-frame">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 20px 12px', flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: '#FF6000', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0 }}>LBM</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <Skel style={{ height: 10, width: 70 }} />
              <Skel style={{ height: 15, width: 100 }} />
            </div>
          </div>

          <div className="cp-body">
            <Skel style={{ height: 92, borderRadius: 20 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Skel style={{ height: 18, width: '55%' }} />
              <MobileCardSkeleton />
              <MobileCardSkeleton />
            </div>
          </div>
        </div>
      </main>

      <div className="client-desktop">
        <nav aria-label="Main" className="cd-nav">
          <div className="cd-nav-inner">
            <span className="cd-logo"><em>LEGACY MEDIA</em></span>
            <div style={{ flex: 1 }} />
            <Skel style={{ width: 34, height: 34, borderRadius: '50%' }} />
          </div>
        </nav>
        <div style={{ padding: '32px 40px', maxWidth: 1280, margin: '0 auto' }}>
          <Skel style={{ height: 28, width: 260, marginBottom: 28 }} />
          <Skel style={{ height: 96, borderRadius: 16, marginBottom: 28 }} />
          <Skel style={{ height: 22, width: 200, marginBottom: 16 }} />
          <div className="cd-review-grid">
            <DesktopCardSkeleton />
            <DesktopCardSkeleton />
            <DesktopCardSkeleton />
          </div>
        </div>
      </div>
    </>
  );
}
