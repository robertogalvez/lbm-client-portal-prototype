import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

const handler = toNextJsHandler(auth);

export async function GET(req: Request) {
  try {
    return await handler.GET(req);
  } catch (err) {
    console.error('[auth GET]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    return await handler.POST(req);
  } catch (err) {
    console.error('[auth POST]', err);
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
