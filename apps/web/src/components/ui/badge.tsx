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

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn('inline-flex h-5 items-center gap-1 rounded px-1.5 text-[12px] font-medium', tones[tone], className)}>{children}</span>;
}

/** Firma visual: tipo de uva como el color del vino, siempre con texto (no solo color). */
export function TipoUva({ tipo }: { tipo: string | null | undefined }) {
  const tinto = tipo === 'tinto';
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-2">
      <span aria-hidden className={cn('size-2 rounded-full', tinto ? 'bg-tinto' : 'bg-blanco')} />
      {tinto ? 'Tinta' : 'Blanca'}
    </span>
  );
}
