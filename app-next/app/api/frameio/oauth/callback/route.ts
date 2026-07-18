// Complete Adobe IMS OAuth 2.0 (User Authentication) for Frame.io v4. Validates
// state against the cookie set by /start, exchanges the code for tokens
// (client_secret, persisted to oauth_tokens), and returns to Settings. Bypasses
// the session proxy (in PUBLIC_PATHS) — the state cookie is the guard, since only
// the initiator holds it.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeAndStoreTokens } from '@/lib/frameio';

export const dynamic = 'force-dynamic';

function settingsRedirect(req: Request, params: string) {
  return NextResponse.redirect(new URL(`/settings?${params}`, req.url));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  if (oauthError) return settingsRedirect(req, `frameio=error&reason=${encodeURIComponent(oauthError)}`);
  if (!code || !state) return settingsRedirect(req, 'frameio=error&reason=missing_code');

  const jar = await cookies();
  const raw = jar.get('frameio_oauth')?.value;
  if (!raw) return settingsRedirect(req, 'frameio=error&reason=expired');

  let stored: { state?: string };
  try { stored = JSON.parse(raw); } catch { stored = {}; }
  if (!stored.state || stored.state !== state) {
    return settingsRedirect(req, 'frameio=error&reason=state_mismatch');
  }

  const redirectUri = `${url.origin}/api/frameio/oauth/callback`;
  try {
    await exchangeAndStoreTokens(code, redirectUri);
  } catch (e) {
    return settingsRedirect(req, `frameio=error&reason=${encodeURIComponent(e instanceof Error ? e.message : 'exchange_failed')}`);
  }

  const res = settingsRedirect(req, 'frameio=connected');
  res.cookies.delete('frameio_oauth');
  return res;
}
