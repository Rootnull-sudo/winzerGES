import { CloudUpload } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  info: 'bg-info-soft text-info'
};

/** Etiqueta de estado en cápsula (como v1). El texto siempre dice el estado; el color lo refuerza. */
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold', tones[tone], className)}>{children}</span>;
}

/** Punto de tipo de uva: vino para tinta, dorado para blanca. */
export function UvaDot({ tipo, className }: { tipo: string | null | undefined; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-2 shrink-0 rounded-full', tipo === 'tinto' ? 'bg-tinto' : 'bg-blanco-fill', className)} />;
}

/** Tipo de uva en cápsula: color del vino + texto. */
export function TipoUva({ tipo }: { tipo: string | null | undefined }) {
  const tinto = tipo === 'tinto';
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[12px] font-semibold',
        tinto ? 'bg-tinto-soft text-tinto' : 'bg-blanco-soft text-blanco'
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', tinto ? 'bg-tinto' : 'bg-blanco')} />
      {tinto ? 'Tinta' : 'Blanca'}
    </span>
  );
}

/** Código de un registro (cuartel, estanque, lote) en negrita, con aviso si tiene cambios sin enviar. */
export function Codigo({ codigo, pending }: { codigo: string; pending?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-bold">
      {codigo}
      {pending && <CloudUpload size={14} className="text-info" aria-label="Pendiente de sincronizar" />}
    </span>
  );
}
