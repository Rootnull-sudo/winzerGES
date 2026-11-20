'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Tab<T extends string> {
  id: T;
  label: string;
  count?: number;
}

/**
 * Pestañas de una página, con la pestaña en la URL (`?tab=`): un enlace (p. ej. desde un aviso) abre la correcta y
 * se conservan los demás parámetros, como la temporada (`?t=`). La primera pestaña no escribe `tab`.
 */
export function useTab<T extends string>(tabs: readonly Tab<T>[]): [T, (t: T) => void] {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const pedida = sp.get('tab') as T | null;
  const actual = tabs.find((t) => t.id === pedida)?.id ?? tabs[0]!.id;
  function cambiar(t: T) {
    const q = new URLSearchParams(sp);
    if (t === tabs[0]!.id) q.delete('tab');
    else q.set('tab', t);
    const qs = q.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }
  return [actual, cambiar];
}

export function Tabs<T extends string>({
  tabs,
  actual,
  onChange,
  acciones
}: {
  tabs: readonly Tab<T>[];
  actual: T;
  onChange: (t: T) => void;
  acciones?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-rule">
      <div role="tablist" className="-mb-px flex gap-5 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={actual === t.id}
            onClick={() => onChange(t.id)}
            className={cn(
              'h-10 shrink-0 border-b-2 text-[14px] font-medium whitespace-nowrap',
              actual === t.id ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink'
            )}
          >
            {t.label}
            {t.count != null && <span className="ml-1 text-ink-4 tabular">{t.count}</span>}
          </button>
        ))}
      </div>
      {acciones && <div className="mb-2 flex gap-2">{acciones}</div>}
    </div>
  );
}
