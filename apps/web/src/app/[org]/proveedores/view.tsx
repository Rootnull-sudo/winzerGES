'use client';
import { Tabs, useTab } from '@/components/ui/tabs';
import type { ProveedorRow } from './comun';
import { Maestro } from './maestro';

const TABS = [{ id: 'proveedores', label: 'Proveedores' }] as const;

export function ProveedoresView({ proveedores }: { proveedores: ProveedorRow[] }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'proveedores' && <Maestro proveedores={proveedores} />}
    </>
  );
}
