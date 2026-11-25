'use client';
/**
 * Gráficos para páginas de servidor (dashboard): el formato se elige por nombre, porque una página de servidor no
 * puede pasar funciones a un componente de cliente.
 */
import { clp } from '@winzer/domain';
import type { ComponentProps } from 'react';
import { BarrasAgrupadas, BarrasH, Lineas } from '@/components/ui/chart';

export type FormatoGrafico = 'compacto' | 'pct' | 'num';
const FORMATOS: Record<FormatoGrafico, (v: number) => string> = {
  compacto: (v) => (Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 }) + ' M' : clp(Math.round(v) || 0)),
  pct: (v) => `${v} %`,
  num: (v) => (Math.round(v) || 0).toLocaleString('es-CL')
};

type Sin<T, K extends keyof T> = Omit<T, K> & { fmt?: FormatoGrafico };

export function BarrasHF({ fmt = 'num', ...p }: Sin<ComponentProps<typeof BarrasH>, 'formato'>) {
  return <BarrasH {...p} formato={FORMATOS[fmt]} />;
}
export function BarrasAgrupadasF({ fmt = 'num', ...p }: Sin<ComponentProps<typeof BarrasAgrupadas>, 'formato'>) {
  return <BarrasAgrupadas {...p} formato={FORMATOS[fmt]} />;
}
export function LineasF({ fmt = 'num', ...p }: Sin<ComponentProps<typeof Lineas>, 'formato'>) {
  return <Lineas {...p} formato={FORMATOS[fmt]} />;
}
