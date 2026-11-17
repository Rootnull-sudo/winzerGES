import { importV1, isV1Dump } from '@winzer/db';
import { can } from '@winzer/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { apiActor, errorResponse } from '@/lib/api';

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const r = await apiActor((await params).org);
  if ('error' in r) return r.error;
  if (!can(r.actor.role, 'configuracion', 'e', r.actor.customRoles))
    return NextResponse.json({ error: 'Solo un administrador puede importar datos.' }, { status: 403 });
  try {
    const dump = await req.json();
    if (!isV1Dump(dump)) return NextResponse.json({ error: 'El archivo no es un respaldo de Winzer Gestión v1.' }, { status: 422 });
    return NextResponse.json(await importV1(r.actor, dump));
  } catch (e) {
    return errorResponse(e);
  }
}
