import { calcularAlertas, REGLAS, sync } from '@winzer/db';
import type { Mutation } from '@winzer/domain';
import { after, NextResponse, type NextRequest } from 'next/server';
import { apiActor, errorResponse } from '@/lib/api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const r = await apiActor((await params).org);
  if ('error' in r) return r.error;
  try {
    const body = (await req.json()) as { mutations?: Mutation[] };
    if (!Array.isArray(body.mutations) || body.mutations.length > 200) return NextResponse.json({ error: 'Lote inválido.' }, { status: 400 });
    const results = await sync.push(r.actor, body.mutations);
    // Lo que llegó del campo puede abrir o resolver alertas (p. ej. SO₂): se recalculan después de responder,
    // sin hacer esperar al dispositivo (ADR 0012).
    if (results.some((x) => x.status === 'ok')) after(() => calcularAlertas(r.actor.orgId, REGLAS).then(() => undefined));
    return NextResponse.json({ results });
  } catch (e) {
    return errorResponse(e);
  }
}
