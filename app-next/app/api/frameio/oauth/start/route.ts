// Begin Frame.io OAuth 2.0 (PKCE) authorization. Admin-only. Generates a PKCE
// verifier/challenge + state, stashes them in a short-lived httpOnly cookie, and
// redirects the browser to Frame.io's consent screen. The callback completes it.

import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomBytes, createHash } from 'crypto';
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

  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const state = randomBytes(16).toString('base64url');

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/api/frameio/oauth/callback`;

  let authUrl: string;
  try {
    authUrl = buildAuthUrl(redirectUri, state, challenge);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }

  const res = NextResponse.redirect(authUrl);
  res.cookies.set('frameio_oauth', JSON.stringify({ state, verifier }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}
