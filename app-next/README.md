This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Environment variables

Set these in the Netlify UI (Site settings → Environment variables), scoped to
Functions/runtime — do not put values in `netlify.toml` or commit `.env` files.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres connection string (include `sslmode=require`; use the `-pooler` host for any TCP client — the runtime uses the HTTP driver) |
| `BETTER_AUTH_SECRET` | better-auth signing secret — **required**; the app returns 503 without it |
| `BETTER_AUTH_URL` | Public base URL of the deployment |
| `MIGRATE_SECRET` | Guards `/api/migrate`, `/api/sync`, `/api/admin/bootstrap` |
| `CRON_SECRET` | Guards the publish/reconcile/debug cron endpoints |
| `CLICKUP_API_TOKEN`, `CLICKUP_LIST_ID`, `CLICKUP_FOLDER_ID`, `CLICKUP_CLIENTS_LIST_ID` | ClickUp API access + list/folder targets |
| `CLICKUP_WEBHOOK_SECRET` | HMAC secret for `/api/webhooks/clickup` |
| `POSTMARK_API_KEY` | Magic-link login emails |
| `FRAMEIO_API_TOKEN`, `FRAMEIO_ACCOUNT_ID`, `FRAMEIO_CLIENT_ID`, `FRAMEIO_CLIENT_SECRET`, `FRAMEIO_OAUTH_SCOPES`, `FRAMEIO_REFRESH_TTL_DAYS` | Frame.io integration |
| `VISTASOCIAL_API_TOKEN`, `VISTASOCIAL_API_BASE` | Vista Social publishing |

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
