import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { loadClientDetail } from '@/lib/client-detail';

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const data = await loadClientDetail(id);
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
