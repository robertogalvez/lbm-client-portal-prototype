import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login', '/api/auth', '/api/migrate', '/api/sync', '/api/seed-contracts', '/api/seed-social-links',
  // Self-authenticating endpoints (cron secret / HMAC / migrate secret in-handler)
  // must bypass the session redirect — they're called by ClickUp and the
  // scheduled functions, which have no session cookie.
  '/api/webhooks', '/api/publish', '/api/admin/publish',
  // Frame.io OAuth callback: hit via redirect from Frame.io (no session); guarded
  // by the PKCE state cookie in-handler. renew-check: called by the cron (no
  // session), cron-secret guarded. (/start stays session-gated in-handler.)
  '/api/frameio/oauth/callback', '/api/frameio/oauth/renew-check',
  // QuickBooks OAuth callback: hit via redirect from Intuit (no session);
  // guarded by the state cookie in-handler. (/start stays session-gated.)
  '/api/quickbooks/oauth/callback',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname.includes('.')) return NextResponse.next();

  // Fail closed: a deployment missing its auth secret must not expose the app
  if (!process.env.BETTER_AUTH_SECRET) {
    return new NextResponse('Auth is not configured', { status: 503 });
  }

  try {
    // Inline cookie check — avoids importing BetterAuth at proxy level
    const sessionCookie = request.cookies.get('better-auth.session_token')
      ?? request.cookies.get('__Secure-better-auth.session_token');

    if (!sessionCookie) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('callbackUrl', pathname);
      return NextResponse.redirect(loginUrl);
    }
  } catch {
    // If anything goes wrong, redirect to login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
