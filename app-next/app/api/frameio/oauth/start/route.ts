// Begin Adobe IMS OAuth 2.0 (User Authentication / OAuth Web App) authorization
// for the Frame.io v4 API. Admin-only. Generates a CSRF `state`, stashes it in a
// short-lived httpOnly cookie, and redirects to Adobe's consent screen. The
// callback completes the exchange (confidential client — client_secret, no PKCE).

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomBytes } from 'crypto';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { authUsers } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { buildAuthUrl } from '@/lib/frameio';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL('/login', req.url));

  const [caller] = await db
    .select({ role: authUsers.role })
    .from(authUsers)
    .where(eq(authUsers.id, session.user.id))
    .limit(1);
  if (!caller || caller.role !== 'admin') return NextResponse.redirect(new URL('/dashboard', req.url));

  const state = randomBytes(16).toString('base64url');

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/frameio/oauth/callback`;

  let authUrl: string;
  try {
    authUrl = buildAuthUrl(redirectUri, state);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set('frameio_oauth', JSON.stringify({ state }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
