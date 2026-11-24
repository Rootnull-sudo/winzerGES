'use client';
import { Tabs, useTab } from '@/components/ui/tabs';
import { Formatos } from './formatos';
import { Ordenes } from './ordenes';
import { Validador } from './validador';

export interface FormatoFila {
  id: string;
  version: number;
  nombre: string;
  litros: number;
  envase: string;
  unidadesCaja: number;
  stockMinimo: number;
  /** Unidades en stock (libro de producto terminado). */
  stock: number;
}
export interface OrdenFila {
  id: string;
  version: number;
  codigo: string | null;
  fecha: string;
  estanqueId: string;
  loteId: string;
  formatoId: string;
  unidades: number;
  mermaPct: number;
  responsable: string | null;
  envaseId: string;
  cierreId: string | null;
  capsulaId: string | null;
  cajaId: string | null;
  etiquetaId: string | null;
  etiquetaInsumoId: string | null;
  manoObra: number;
  energiaAgua: number;
  graduacion: number | null;
  declaraDO: boolean;
  pctUvaZona: number | null;
  certificadoDO: string | null;
  observaciones: string | null;
  estado: string;
  costoUnitario: number | null;
  costoTotal: number | null;
  litrosConsumidos: number | null;
  costoPartes: Record<string, number> | null;
  stock: number;
}
export interface InsumoEnv {
  id: string;
  nombre: string;
  unidad: string;
  tipo: string;
  precio: number;
  stock: number;
}
export interface EtiquetaEnv {
  id: string;
  nombre: string;
  costoImpresion: number;
  costoDiseno: number;
  costoFotografia: number;
  costoIlustracion: number;
  tirajeEstimado: number;
  producidas: number;
  denominacion: string | null;
  graduacion: number | null;
  contenido: string | null;
  varietal: string | null;
  do: string | null;
  aprobacionLegal: boolean;
}
export interface DatosEnvasado {
  insumos: InsumoEnv[];
  etiquetas: EtiquetaEnv[];
  /** Litros de cada lote en cada estanque (v_stock_estanque). */
  enEstanque: { estanqueId: string; loteId: string; litros: number }[];
  lotes: { id: string; codigo: string; variedad: string | null; tipo: string }[];
  estanques: { id: string; codigo: string }[];
  /** Costo por litro de cada lote con vino en estanque. */
  costoLitro: Record<string, number>;
  mermaMax: number;
  vina: { razonSocial: string | null; rut: string | null };
}

const TABS = [
  { id: 'ordenes', label: 'Órdenes' },
  { id: 'validador', label: 'Validador de etiqueta' },
  { id: 'formatos', label: 'Formatos' }
] as const;

export function EnvasadoView({ formatos, ordenes, datos }: { formatos: FormatoFila[]; ordenes: OrdenFila[]; datos: DatosEnvasado }) {
  const [tab, setTab] = useTab(TABS);
  return (
    <>
      <Tabs tabs={TABS} actual={tab} onChange={setTab} />
      {tab === 'ordenes' && <Ordenes ordenes={ordenes} formatos={formatos} datos={datos} />}
      {tab === 'validador' && <Validador ordenes={ordenes} formatos={formatos} datos={datos} />}
      {tab === 'formatos' && <Formatos formatos={formatos} />}
    </>
  );
}
