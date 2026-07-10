import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { createAuthMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';
import { REMEMBER_DEVICE_COOKIE, REMEMBER_DEVICE_SECONDS } from '@/lib/auth-constants';

function isRememberDeviceRequested(headers: Headers | undefined): boolean {
  const cookieHeader = headers?.get('cookie') ?? '';
  return cookieHeader
    .split(';')
    .some(part => part.trim() === `${REMEMBER_DEVICE_COOKIE}=1`);
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user:    schema.authUsers,
      session: schema.authSessions,
      account: schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        try {
          const res = await fetch('https://api.postmarkapp.com/email', {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'X-Postmark-Server-Token': process.env.POSTMARK_API_KEY!,
            },
            body: JSON.stringify({
              From: 'LBM Portal <noreply@flowrk.ca>',
              To: email,
              Subject: 'Your LBM Portal login link',
              HtmlBody: `
                <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                  <p style="font-size: 16px; color: #111c28; margin: 0 0 24px;">Click the button below to log in to the LBM Portal. This link expires in 10 minutes.</p>
                  <a href="${url}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
                    Log in to LBM Portal
                  </a>
                  <p style="font-size: 12px; color: #8b97a4; margin: 24px 0 0;">If you didn't request this, you can ignore this email.</p>
                </div>
              `,
              MessageStream: 'outbound',
            }),
          });
          const data = await res.json();
          if (!res.ok) console.error('[sendMagicLink] Postmark error:', data);
          else console.log('[sendMagicLink] sent to', email, 'id:', data.MessageID);
        } catch (err) {
          console.error('[sendMagicLink] exception:', err);
          throw err;
        }
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    additionalFields: {
      rememberDevice: { type: 'boolean', required: false, defaultValue: false },
    },
  },
  user: {
    additionalFields: {
      role:         { type: 'string',  required: false, defaultValue: 'account_manager' },
      clientName:   { type: 'string',  required: false },
      isAlsoClient: { type: 'boolean', required: false, defaultValue: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session, ctx) => {
          if (!isRememberDeviceRequested(ctx?.request?.headers)) return;
          return {
            data: {
              ...session,
              rememberDevice: true,
              expiresAt: new Date(Date.now() + REMEMBER_DEVICE_SECONDS * 1000),
            },
          };
        },
      },
      update: {
        // better-auth's built-in sliding refresh (updateAge) only passes the
        // changed fields here (no session id/token), so we can't look the
        // row up directly. The session record for the request that triggered
        // this refresh is already loaded on the ambient auth context though —
        // use that to tell whether the session being refreshed was a
        // "remembered" one, and if so keep its horizon at 400 days instead of
        // letting it collapse back to the global 7-day expiresIn.
        before: async (session, ctx) => {
          const current = ctx?.context?.session?.session as { rememberDevice?: boolean } | undefined;
          if (!current?.rememberDevice) return;
          return {
            data: {
              ...session,
              expiresAt: new Date(Date.now() + REMEMBER_DEVICE_SECONDS * 1000),
            },
          };
        },
      },
    },
  },
  hooks: {
    // better-auth's own session cookie writer always uses the static
    // `session.expiresIn` config for the cookie's Max-Age (it ignores the
    // actual row's `expiresAt`), so a remembered session's *database* row
    // would be extended to 400 days but the browser would still drop the
    // cookie after 7. Re-issue the cookie here with the real expiry once the
    // magic-link sign-in has created the session.
    after: createAuthMiddleware(async ctx => {
      if (ctx.path !== '/magic-link/verify') return;
      const newSession = ctx.context.newSession as { session: { rememberDevice?: boolean; expiresAt: Date } } | null;
      if (!newSession?.session.rememberDevice) return;
      const maxAge = Math.floor((new Date(newSession.session.expiresAt).getTime() - Date.now()) / 1000);
      await setSessionCookie(ctx, newSession as Parameters<typeof setSessionCookie>[1], false, { maxAge });
    }),
  },
});

export type Session = typeof auth.$Infer.Session;
