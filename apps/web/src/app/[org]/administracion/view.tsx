'use client';
import { Tabs, useTab } from '@/components/ui/tabs';
import { Gastos } from './gastos';
import { Presupuesto } from './presupuesto';

export interface GastoRow {
  id: string;
  version: number;
  fecha: string;
  categoria: string;
  descripcion: string;
  proveedorId: string | null;
  monto: number;
  documento: string;
  folio: string | null;
  afectoIVA: boolean;
  iva: number;
  total: number;
  medioPago: string;
  estado: string;
  tipoCosto: string;
  area: string;
  noDeducible: boolean;
  observaciones: string | null;
  /** Saldo por pagar si es a crédito (v_por_pagar); null si se pagó al contado. */
  saldo: number | null;
}
export interface PresupuestoRow {
  anio: number;
  categoria: string;
  monto: number;
}
export type ProveedorOpt = { id: string; nombre: string };

const TABS = [
  { id: 'gastos', label: 'Gastos' },
  { id: 'presupuesto', label: 'Presupuesto' }
] as const;

export function AdministracionView({
  gastos,
  presupuestos,
  proveedores,
  tasaIVA
}: {
  gastos: GastoRow[];
  presupuestos: PresupuestoRow[];
  proveedores: ProveedorOpt[];
  tasaIVA: number;
}) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'gastos' && <Gastos gastos={gastos} proveedores={proveedores} tasaIVA={tasaIVA} />}
      {tab === 'presupuesto' && <Presupuesto gastos={gastos} presupuestos={presupuestos} />}
    </>
  );
}
