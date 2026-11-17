import { sync } from '@winzer/db';
import type { Mutation } from '@winzer/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { apiActor, errorResponse } from '@/lib/api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const r = await apiActor((await params).org);
  if ('error' in r) return r.error;
  try {
    const body = (await req.json()) as { mutations?: Mutation[] };
    if (!Array.isArray(body.mutations) || body.mutations.length > 200) return NextResponse.json({ error: 'Lote inválido.' }, { status: 400 });
    return NextResponse.json({ results: await sync.push(r.actor, body.mutations) });
  } catch (e) {
    return errorResponse(e);
  }
}
