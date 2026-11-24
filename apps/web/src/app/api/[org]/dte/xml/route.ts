/**
 * Descarga del XML de DTE (F6-1). `?id=` uno, `?periodo=AAAA-MM&direccion=emitido` el lote del período.
 * Se entrega en ISO-8859-1 de verdad (bytes Latin-1), igual a lo que declara el encabezado (v1 escribía UTF-8).
 */
import { withOrg, xmlDeDtes } from '@winzer/db';
import { aLatin1, can } from '@winzer/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { apiActor, errorResponse } from '@/lib/api';

export async function GET(req: NextRequest, { params }: { params: Promise<{ org: string }> }) {
  const r = await apiActor((await params).org);
  if ('error' in r) return r.error;
  if (!can(r.actor.role, 'dte', 'v', r.actor.customRoles, r.actor.acceso)) return NextResponse.json({ error: 'Sin acceso a DTE.' }, { status: 403 });
  const q = req.nextUrl.searchParams;
  const id = q.get('id');
  const periodo = q.get('periodo');
  if (!id && !(periodo && /^\d{4}-\d{2}$/.test(periodo))) return NextResponse.json({ error: 'Indica un documento o un período.' }, { status: 400 });
  try {
    const x = await withOrg(r.actor.orgId, (tx) =>
      xmlDeDtes(tx, id ? { ids: [id] } : { periodo: periodo!, direccion: q.get('direccion') === 'recibido' ? 'recibido' : 'emitido' })
    );
    if (!x) return NextResponse.json({ error: 'No hay documentos.' }, { status: 404 });
    return new NextResponse(Buffer.from(aLatin1(x.xml)), {
      headers: {
        'content-type': 'application/xml; charset=ISO-8859-1',
        'content-disposition': `attachment; filename="${x.nombre.replace(/[^\w.-]/g, '_')}"`
      }
    });
  } catch (e) {
    return errorResponse(e);
  }
}
