// Complete Intuit OAuth 2.0 for QuickBooks Online. Validates state against the
// cookie set by /start, exchanges the code for tokens (persisted to
// oauth_tokens along with the realmId Intuit returns here), and returns to
// Settings. Bypasses the session proxy (in PUBLIC_PATHS) — the state cookie is
// the guard, since only the initiator holds it.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeAndStoreTokens } from '@/lib/quickbooks';

export const dynamic = 'force-dynamic';

function settingsRedirect(req: Request, params: string) {
  return NextResponse.redirect(new URL(`/settings?${params}`, req.url));
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const realmId = url.searchParams.get('realmId');
  const oauthError = url.searchParams.get('error');

  if (oauthError) return settingsRedirect(req, `quickbooks=error&reason=${encodeURIComponent(oauthError)}`);
  if (!code || !state) return settingsRedirect(req, 'quickbooks=error&reason=missing_code');
  if (!realmId) return settingsRedirect(req, 'quickbooks=error&reason=missing_realm');

  const jar = await cookies();
  const raw = jar.get('quickbooks_oauth')?.value;
  if (!raw) return settingsRedirect(req, 'quickbooks=error&reason=expired');

  let stored: { state?: string };
  try { stored = JSON.parse(raw); } catch { stored = {}; }
  if (!stored.state || stored.state !== state) {
    return settingsRedirect(req, 'quickbooks=error&reason=state_mismatch');
  }

  const redirectUri = `${url.origin}/api/quickbooks/oauth/callback`;
  try {
    await exchangeAndStoreTokens(code, redirectUri, realmId);
  } catch (e) {
    return settingsRedirect(req, `quickbooks=error&reason=${encodeURIComponent(e instanceof Error ? e.message : 'exchange_failed')}`);
  }

  const res = settingsRedirect(req, 'quickbooks=connected');
  res.cookies.delete('quickbooks_oauth');
  return res;
}
