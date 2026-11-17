import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'text-ink-2',
  ok: 'text-ink-2',
  warn: 'font-semibold text-warn',
  bad: 'font-semibold text-bad',
  info: 'text-info'
};

/**
 * Estado en texto. Lo normal ("ok") no se pinta: el color se guarda para lo que pide atención
 * (advertencia, error). Así una tabla sana se lee en blanco y negro.
 */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex items-center gap-1 text-[13px]', tones[tone], className)}>{children}</span>;
}

/** Punto de tipo de uva: tinto relleno, blanco vacío. Siempre con texto (nunca solo forma o color). */
export function UvaDot({ tipo, className }: { tipo: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full border border-ink', tipo === 'tinto' && 'bg-ink', className)} />;
}

export function TipoUva({ tipo }: { tipo: string | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <UvaDot tipo={tipo} />
      {tipo === 'tinto' ? 'Tinta' : 'Blanca'}
    </span>
  );
}

/**
 * Sello: el código de un registro (cuartel, estanque, lote) como la marca a fuego de una barrica.
 * La línea bajo el código dice su estado de sincronización por forma: continua = guardado en el
 * servidor, de trazos = pendiente de enviar.
 */
export function Sello({ codigo, pending, size = 'md' }: { codigo: string; pending?: boolean; size?: 'md' | 'lg' }) {
  const lg = size === 'lg';
  return (
    <span
      className={cn(
        'inline-flex shrink-0 flex-col items-center justify-center gap-[3px] rounded-full border border-ink font-label leading-none tracking-[0.04em] text-ink',
        lg ? 'h-[72px] min-w-[72px] text-[20px]' : 'h-[52px] min-w-[52px] text-[15px]',
        // Códigos largos: el círculo se estira a cápsula en vez de cortar el texto.
        codigo.length > 5 && (lg ? 'px-4 text-[17px]' : 'px-3 text-[13px]')
      )}
    >
      <span className="whitespace-nowrap">{codigo}</span>
      {pending ? (
        <span role="img" aria-label="Pendiente de sincronizar" className="w-[22px] border-t border-dashed border-ink" />
      ) : (
        <span aria-hidden className="w-[22px] border-t border-ink" />
      )}
    </span>
  );
}
