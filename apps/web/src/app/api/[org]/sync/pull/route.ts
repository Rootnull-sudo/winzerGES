import { sync } from '@winzer/db';
import { NextResponse, type NextRequest } from 'next/server';
import { apiActor, errorResponse } from '@/lib/api';

export async function GET(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const r = await apiActor((await params).org);
  if ('error' in r) return r.error;
  try {
    return NextResponse.json(await sync.pull(r.actor, req.nextUrl.searchParams.get('since')));
  } catch (e) {
    return errorResponse(e);
  }
}
