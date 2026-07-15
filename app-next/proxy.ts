import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login', '/api/auth', '/api/debug', '/api/migrate', '/api/debug-clickup',
  // Self-authenticating endpoints (cron secret / HMAC / migrate secret in-handler)
  // must bypass the session redirect — they're called by ClickUp and the
  // scheduled functions, which have no session cookie.
  '/api/webhooks', '/api/publish', '/api/admin/publish',
];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths and static assets
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) return NextResponse.next();
  if (pathname.startsWith('/_next') || pathname.includes('.')) return NextResponse.next();

  // If auth is not configured yet, pass through (avoids crash during setup)
  if (!process.env.BETTER_AUTH_SECRET) return NextResponse.next();

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
