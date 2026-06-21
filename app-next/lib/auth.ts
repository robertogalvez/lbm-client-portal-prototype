import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

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
  },
  user: {
    additionalFields: {
      role:         { type: 'string',  required: false, defaultValue: 'account_manager' },
      clientName:   { type: 'string',  required: false },
      isAlsoClient: { type: 'boolean', required: false, defaultValue: false },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
