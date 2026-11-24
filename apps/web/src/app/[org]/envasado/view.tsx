'use client';
import { Tabs, useTab } from '@/components/ui/tabs';
import { Formatos } from './formatos';

export interface FormatoFila {
  id: string;
  version: number;
  nombre: string;
  litros: number;
  envase: string;
  unidadesCaja: number;
  stockMinimo: number;
  /** Unidades en stock (libro de producto terminado, F5-2). */
  stock: number;
}

const TABS = [{ id: 'formatos', label: 'Formatos' }] as const;

export function EnvasadoView({ formatos }: { formatos: FormatoFila[] }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'formatos' && <Formatos formatos={formatos} />}
    </>
  );
}
