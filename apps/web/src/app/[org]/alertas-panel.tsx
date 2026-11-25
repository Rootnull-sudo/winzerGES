'use client';
/** Panel de alertas del dashboard (v1: dashboard "Producción y alertas"): conteo por severidad y lista con enlace. */
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useOrg } from '@/components/shell/org-context';
import { Badge } from '@/components/ui/badge';

const TONO = { bad: 'bad', warn: 'warn', info: 'info' } as const;
const NOMBRE = { bad: 'Urgentes', warn: 'Atención', info: 'Información' } as const;

export function PanelAlertas() {
  const { alertas, org } = useOrg();
  if (!alertas.length)
    return (
      <p className="flex items-center gap-2 rounded-card border border-rule bg-raised px-4 py-3 text-[14px] text-ok">
        <CheckCircle2 size={16} aria-hidden /> Todo en orden: no hay avisos abiertos.
      </p>
    );
  return (
    <section aria-label="Avisos abiertos" className="rounded-card border border-rule bg-raised p-5">
      <div className="mb-3 flex flex-wrap gap-2">
        {(['bad', 'warn', 'info'] as const).map((s) => {
          const n = alertas.filter((a) => a.severidad === s).length;
          return n ? (
            <Badge key={s} tone={TONO[s]}>
              {NOMBRE[s]}: {n}
            </Badge>
          ) : null;
        })}
      </div>
      <ul className="divide-y divide-rule text-[14px]">
        {alertas.slice(0, 8).map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 py-2">
            <span>
              <b className={a.severidad === 'bad' ? 'text-bad' : undefined}>{a.titulo}</b>
              {a.mensaje && <span className="block text-[13px] text-ink-3">{a.mensaje}</span>}
            </span>
            {a.ruta && (
              <Link href={`/${org.slug}/${a.ruta}`} className="shrink-0 text-[13px] font-semibold underline">
                Revisar
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
