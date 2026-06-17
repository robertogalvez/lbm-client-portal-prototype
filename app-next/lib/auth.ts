import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { db } from '@/lib/db';
import * as schema from '@/lib/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user:         schema.authUsers,
      session:      schema.authSessions,
      account:      schema.authAccounts,
      verification: schema.authVerifications,
    },
  }),
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);
          const result = await resend.emails.send({
            from: 'LBM Portal <onboarding@resend.dev>',
            to: email,
            subject: 'Your LBM Portal login link',
            html: `
              <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 24px;">
                <p style="font-size: 16px; color: #111c28; margin: 0 0 24px;">Click the button below to log in to the LBM Portal. This link expires in 10 minutes.</p>
                <a href="${url}" style="display: inline-block; background: #FF6000; color: #fff; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 8px; text-decoration: none;">
                  Log in to LBM Portal
                </a>
                <p style="font-size: 12px; color: #8b97a4; margin: 24px 0 0;">If you didn't request this, you can ignore this email.</p>
              </div>
            `,
          });
          if (result.error) console.error('[sendMagicLink] Resend error:', result.error);
          else console.log('[sendMagicLink] sent to', email, 'id:', result.data?.id);
        } catch (err) {
          console.error('[sendMagicLink] exception:', err);
          throw err;
        }
      },
    }),
  ],
  session: {
    expiresIn: 60 * 60 * 24 * 7,
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'account_manager' },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
