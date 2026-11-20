'use client';
import { CATEGORIAS_INSUMO, stockInsumo, type Insumo, type MovInsumo } from '@winzer/domain';
import { useMemo } from 'react';
import { useEntity } from '@/lib/offline/hooks';

export type InsumoRow = Insumo & { _pending: boolean; _version: number };
export type MovRow = MovInsumo & { _pending: boolean };

export const CATEGORIA = Object.fromEntries(CATEGORIAS_INSUMO) as Record<string, string>;
export const TONO_CATEGORIA: Record<string, 'ok' | 'info' | 'neutral'> = { agricola: 'ok', enologico: 'info' };
export const TIPO_MOV: Record<string, string> = {
  compra: 'Compra',
  aplicacion: 'Aplicación',
  aditivo: 'Aditivo',
  so2: 'SO₂',
  consumo_envasado: 'Envasado',
  ajuste: 'Ajuste',
  nota_credito: 'Nota de crédito'
};
/** Stock de cada insumo calculado con los movimientos locales (funciona sin señal). */
export function useStock() {
  const insumos = useEntity<Insumo>('insumo') as InsumoRow[] | undefined;
  const movs = useEntity<MovInsumo>('mov_insumo') as MovRow[] | undefined;
  const stock = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of insumos ?? []) m.set(i.id, stockInsumo(i, movs ?? []));
    return m;
  }, [insumos, movs]);
  return { insumos, movs, stock };
}
