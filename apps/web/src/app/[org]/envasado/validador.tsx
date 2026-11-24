'use client';
/** Validador de rotulación (Ley 18.455 y Decreto 78) por orden de envasado. */
import { validarRotulacion } from '@winzer/domain';
import { CircleCheck, CircleAlert, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Select } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/cn';
import type { DatosEnvasado, FormatoFila, OrdenFila } from './view';

export function Validador({ ordenes, formatos, datos }: { ordenes: OrdenFila[]; formatos: FormatoFila[]; datos: DatosEnvasado }) {
  const vigentes = ordenes.filter((o) => o.estado !== 'anulada').sort((a, b) => b.fecha.localeCompare(a.fecha));
  const [id, setId] = useState(vigentes[0]?.id ?? '');
  const o = vigentes.find((x) => x.id === id);
  if (!o)
    return <EmptyState icon={<ShieldCheck size={28} strokeWidth={1.5} />} title="Sin órdenes" text="Crea una orden de envasado para validar su etiqueta." />;
  const et = datos.etiquetas.find((e) => e.id === o.etiquetaId) ?? null;
  const items = validarRotulacion({ etiqueta: et, orden: o, formato: formatos.find((f) => f.id === o.formatoId) ?? null, vina: datos.vina });
  const faltan = items.filter((i) => !i.ok).length;
  return (
    <section aria-label="Validación de rotulación" className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-ink-2">
          {faltan ? (
            <b className="text-warn">
              {faltan} {faltan === 1 ? 'requisito pendiente' : 'requisitos pendientes'}
            </b>
          ) : (
            <b className="text-ok">La etiqueta cumple los requisitos revisados</b>
          )}{' '}
          · Ley 18.455 y Decreto 78
        </p>
        <div className="w-64">
          <Select aria-label="Orden" value={o.id} onChange={(e) => setId(e.target.value)} className="h-9 text-[14px]">
            {vigentes.map((x) => (
              <option key={x.id} value={x.id}>
                {x.codigo ?? 'Borrador'} · {datos.lotes.find((l) => l.id === x.loteId)?.codigo}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <ul className="divide-y divide-rule rounded-card border border-rule bg-raised">
        {items.map((i) => (
          <li key={i.item} className="flex items-start gap-3 px-4 py-3">
            {i.ok ? (
              <CircleCheck size={18} className="mt-0.5 shrink-0 text-ok" aria-label="Cumple" />
            ) : (
              <CircleAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-label="Pendiente" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">{i.item}</span>
              <span className={cn('block text-[13px]', i.ok ? 'text-ink-2' : 'text-warn')}>{i.detalle}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
