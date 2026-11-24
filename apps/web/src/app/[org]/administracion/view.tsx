'use client';
import type { OrgConfig } from '@winzer/domain';
import { Tabs, useTab } from '@/components/ui/tabs';
import { Activos } from './activos';
import { Gastos } from './gastos';
import { Honorarios } from './honorarios';
import { Presupuesto } from './presupuesto';
import { Remuneraciones } from './remuneraciones';
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
export interface HonorarioFila {
  id: string;
  version: number;
  fecha: string;
  nombre: string;
  rut: string;
  numero: number | null;
  descripcion: string | null;
  bruto: number;
  tasaRetencion: number;
  retencion: number;
  liquido: number;
  estado: string;
  fechaPago: string | null;
}
export type TasaVigente = { clave: string; desde: string; valor: number };
export interface RemuneracionFila {
  id: string;
  version: number;
  trabajadorId: string;
  periodo: string;
  estado: string;
  fechaPago: string | null;
  diasTrabajados: number;
  horasExtraCantidad: number;
  base: number;
  gratificacion: number;
  bonos: number;
  comisiones: number;
  horasExtra: number;
  noImponible: number;
  imponible: number;
  afp: number;
  salud: number;
  cesantia: number;
  tributable: number;
  impuestoUnico: number;
  anticipos: number;
  descuentos: number;
  liquido: number;
  cesantiaEmpleador: number;
  sis: number;
  aporteEmpleador: number;
  costoEmpresa: number;
  trabajadorFoto: { nombre: string; rut: string; cargo: string; area: string; contrato?: string; afp: string; salud: string };
  parametros: Partial<{ fecha: string; uf: number; utm: number; imm: number; topeImponibleUF: number; topeAfcUF: number }>;
}
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
  { id: 'remuneraciones', label: 'Remuneraciones' },
  { id: 'honorarios', label: 'Honorarios' },
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
  periodo,
  remuneracionesMes,
  indicadoresMes,
  honorarios,
  tasasRetencion,
  tasaIVA
}: {
  gastos: GastoRow[];
  presupuestos: PresupuestoRow[];
  proveedores: ProveedorOpt[];
  activos: ActivoRow[];
  trabajadores: TrabajadorFila[];
  remuneraciones: OrgConfig['remuneraciones'];
  periodo: string;
  remuneracionesMes: RemuneracionFila[];
  indicadoresMes: OrgConfig['remuneraciones'];
  honorarios: HonorarioFila[];
  tasasRetencion: TasaVigente[];
  tasaIVA: number;
}) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'trabajadores' && <Trabajadores trabajadores={trabajadores} remuneraciones={remuneraciones} />}
      {tab === 'remuneraciones' && <Remuneraciones periodo={periodo} filas={remuneracionesMes} indicadores={indicadoresMes} />}
      {tab === 'honorarios' && <Honorarios honorarios={honorarios} tasas={tasasRetencion} />}
      {tab === 'gastos' && <Gastos gastos={gastos} proveedores={proveedores} tasaIVA={tasaIVA} />}
      {tab === 'presupuesto' && <Presupuesto gastos={gastos} presupuestos={presupuestos} />}
      {tab === 'activos' && <Activos activos={activos} />}
    </>
  );
}
