'use client';
import type { OrgConfig } from '@winzer/domain';
import { Tabs, useTab } from '@/components/ui/tabs';
import { Activos } from './activos';
import { Gastos } from './gastos';
import { Presupuesto } from './presupuesto';
import { Trabajadores } from './trabajadores';

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
export interface TrabajadorFila {
  id: string;
  version: number;
  nombre: string;
  rut: string;
  cargo: string;
  area: string;
  contrato: string;
  ingreso: string | null;
  termino: string | null;
  sueldoBase: number;
  gratificacion: string;
  gratificacionMonto: number;
  bonos: number;
  comisiones: number;
  colacion: number;
  movilizacion: number;
  afp: string;
  tasaAfp: number | null;
  salud: string;
  planSalud: number;
  vacacionesPendientes: number;
  observaciones: string | null;
}
export interface ActivoRow {
  id: string;
  version: number;
  nombre: string;
  valor: number;
  vidaUtilAnios: number;
  fechaCompra: string;
  fechaBaja: string | null;
  observaciones: string | null;
}

const TABS = [
  { id: 'trabajadores', label: 'Trabajadores' },
  { id: 'gastos', label: 'Gastos' },
  { id: 'presupuesto', label: 'Presupuesto' },
  { id: 'activos', label: 'Activos fijos' }
] as const;

export function AdministracionView({
  gastos,
  presupuestos,
  proveedores,
  activos,
  trabajadores,
  remuneraciones,
  tasaIVA
}: {
  gastos: GastoRow[];
  presupuestos: PresupuestoRow[];
  proveedores: ProveedorOpt[];
  activos: ActivoRow[];
  trabajadores: TrabajadorFila[];
  remuneraciones: OrgConfig['remuneraciones'];
  tasaIVA: number;
}) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'trabajadores' && <Trabajadores trabajadores={trabajadores} remuneraciones={remuneraciones} />}
      {tab === 'gastos' && <Gastos gastos={gastos} proveedores={proveedores} tasaIVA={tasaIVA} />}
      {tab === 'presupuesto' && <Presupuesto gastos={gastos} presupuestos={presupuestos} />}
      {tab === 'activos' && <Activos activos={activos} />}
    </>
  );
}
