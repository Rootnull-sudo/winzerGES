'use client';
import { Bell, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { marcarVistas } from '@/app/[org]/alertas-actions';
import { cn } from '@/lib/cn';
import { useOrg } from './org-context';

const ICONO = { bad: CircleAlert, warn: TriangleAlert, info: Info } as const;
const COLOR = { bad: 'text-bad', warn: 'text-warn', info: 'text-info' } as const;
const rtf = new Intl.RelativeTimeFormat('es-CL', { numeric: 'auto' });

function hace(iso: string) {
  const min = Math.round((Date.parse(iso) - Date.now()) / 60_000);
  if (Math.abs(min) < 60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  return Math.abs(h) < 24 ? rtf.format(h, 'hour') : rtf.format(Math.round(h / 24), 'day');
}

/**
 * Campana de avisos (ADR 0012). Lee las alertas que calculó el job; al abrirla, las no vistas se marcan como
 * vistas para este usuario. Solo muestra las de módulos que el rol puede ver.
 */
export function Campana() {
  const { org, alertas } = useOrg();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vistasLocal, setVistasLocal] = useState<Set<string>>(new Set());
  // Las que estaban sin ver al abrir: conservan su punto mientras el panel está abierto.
  const [nuevas, setNuevas] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);
  const sinVer = alertas.filter((a) => !a.vista && !vistasLocal.has(a.id));

  useEffect(() => {
    if (!open) return;
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  function alternar() {
    const abrir = !open;
    setOpen(abrir);
    if (abrir) setNuevas(new Set(sinVer.map((a) => a.id)));
    if (abrir && sinVer.length) {
      const ids = sinVer.map((a) => a.id);
      setVistasLocal((s) => new Set([...s, ...ids]));
      void marcarVistas(org.slug, ids).then(() => router.refresh());
    }
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={alternar}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={sinVer.length ? `Avisos: ${sinVer.length} sin ver` : 'Avisos'}
        className="relative grid size-9 place-items-center rounded-full text-ink-2 hover:bg-sunken hover:text-ink"
      >
        <Bell size={17} strokeWidth={1.8} />
        {sinVer.length > 0 && (
          <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-ink px-1 text-[10px] leading-none font-bold text-on-ink tabular">
            {sinVer.length > 9 ? '9+' : sinVer.length}
          </span>
        )}
      </button>
      {open && (
        <div
          role="region"
          aria-label="Avisos"
          className="z-50 rounded-card border border-rule-strong bg-raised text-ink max-sm:fixed max-sm:inset-x-4 max-sm:top-16 sm:absolute sm:top-[calc(100%+8px)] sm:right-0 sm:w-[380px]"
        >
          <p className="border-b border-rule px-4 py-3 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Avisos</p>
          {alertas.length === 0 ? (
            <p className="px-4 py-6 text-center text-[14px] text-ink-3">Sin avisos pendientes.</p>
          ) : (
            <ul className="max-h-[60dvh] divide-y divide-rule overflow-y-auto">
              {alertas.map((a) => {
                const Icono = ICONO[a.severidad];
                const nueva = nuevas.has(a.id);
                const contenido = (
                  <>
                    <Icono size={16} className={cn('mt-0.5 shrink-0', COLOR[a.severidad])} aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-[14px]', nueva ? 'font-semibold' : 'font-medium')}>{a.titulo}</span>
                      {a.mensaje && <span className="mt-0.5 block text-[13px] text-ink-2">{a.mensaje}</span>}
                      <span className="mt-1 block text-[12px] text-ink-3">{hace(a.detectadaEn)}</span>
                    </span>
                    {nueva && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-info" aria-label="nuevo" />}
                  </>
                );
                return (
                  <li key={a.id}>
                    {a.ruta ? (
                      <Link href={`/${org.slug}/${a.ruta}`} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-sunken">
                        {contenido}
                      </Link>
                    ) : (
                      <div className="flex gap-3 px-4 py-3">{contenido}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
