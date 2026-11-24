'use client';
import { Tabs, useTab } from '@/components/ui/tabs';
import type { CompraRow, InsumoOpt, PrecioRow, ProveedorRow } from './comun';
import { Compras } from './compras';
import { Maestro } from './maestro';
import { Precios } from './precios';

const TABS = [
  { id: 'compras', label: 'Compras' },
  { id: 'precios', label: 'Precios' },
  { id: 'proveedores', label: 'Proveedores' }
] as const;

export function ProveedoresView({
  proveedores,
  compras,
  insumos,
  precios,
  tasaIVA
}: {
  proveedores: ProveedorRow[];
  compras: CompraRow[];
  insumos: InsumoOpt[];
  precios: PrecioRow[];
  tasaIVA: number;
}) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'compras' && <Compras compras={compras} proveedores={proveedores} insumos={insumos} tasaIVA={tasaIVA} />}
      {tab === 'precios' && <Precios precios={precios} insumos={insumos} proveedores={proveedores} />}
      {tab === 'proveedores' && <Maestro proveedores={proveedores} />}
    </>
  );
}
