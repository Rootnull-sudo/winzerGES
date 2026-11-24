/**
 * Reglas de alerta comerciales — port de js/core/alerts.js:72 (v1), con su texto.
 * Marca: error si el registro INAPI ya venció; aviso si vence en 180 días o menos.
 */
import { estadoMarca } from '@winzer/domain';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { marca, ordenEnvasado } from '../../schema';
import type { Hallazgo, Regla } from '../motor';

const dmy = (d: string) => d.split('-').reverse().join('-');

async function marcas(tx: Parameters<Regla['evaluar']>[0], hoy: string, cual: 'vencida' | 'renovar'): Promise<Hallazgo[]> {
  const filas = await tx.select({ id: marca.id, nombre: marca.nombre, vencimiento: marca.vencimiento }).from(marca).where(isNull(marca.deletedAt));
  return filas
    .filter((m) => estadoMarca(m.vencimiento, hoy).estado === cual)
    .map((m) => ({
      registroId: m.id,
      entidad: 'marca',
      titulo: `Renovar marca ${m.nombre} (INAPI)`,
      mensaje: cual === 'vencida' ? `Venció el ${dmy(m.vencimiento)}.` : `Vence el ${dmy(m.vencimiento)}.`,
      ruta: 'marca'
    }));
}

export const marcaVencida: Regla = { id: 'marca.vencida', modulo: 'marca', severidad: 'bad', evaluar: (tx, { hoy }) => marcas(tx, hoy, 'vencida') };
export const marcaPorVencer: Regla = { id: 'marca.por_vencer', modulo: 'marca', severidad: 'warn', evaluar: (tx, { hoy }) => marcas(tx, hoy, 'renovar') };

/** Orden de envasado con merma sobre el parámetro de la viña (v1: alerts.js:52, umbral 3 fijo). Últimos 90 días. */
export const mermaEnvasadoAlta: Regla = {
  id: 'envasado.merma_alta',
  modulo: 'envasado',
  severidad: 'warn',
  async evaluar(tx, { hoy, config }) {
    const desde = new Date(Date.parse(`${hoy}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
    const filas = await tx
      .select({ id: ordenEnvasado.id, codigo: ordenEnvasado.codigo, merma: ordenEnvasado.mermaPct })
      .from(ordenEnvasado)
      .where(and(eq(ordenEnvasado.estado, 'confirmada'), isNull(ordenEnvasado.deletedAt), gte(ordenEnvasado.fecha, desde)));
    return filas
      .filter((o) => Number(o.merma) > config.enologia.mermaEnvasadoMax)
      .map((o) => ({
        registroId: o.id,
        entidad: 'orden_envasado',
        titulo: `Merma de envasado alta (${o.codigo})`,
        mensaje: `${Number(o.merma).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}% sobre el volumen envasado.`,
        ruta: 'envasado'
      }));
  }
};

const clp = (v: number) => '$' + Math.round(v).toLocaleString('es-CL');

/** Formato con stock de producto terminado bajo su mínimo (v1: alerts.js:61, con su texto). */
export const formatoBajoMinimo: Regla = {
  id: 'inventarios.formato_bajo_minimo',
  modulo: 'inventarios',
  severidad: 'warn',
  async evaluar(tx) {
    const filas = await tx.execute<{ id: string; nombre: string; stock_minimo: number; stock: string }>(
      sql`select f.id, f.nombre, f.stock_minimo, coalesce(sum(s.stock), 0) as stock
          from formato f left join v_stock_producto s on s.formato_id = f.id
          where f.deleted_at is null and f.stock_minimo > 0
          group by f.id having coalesce(sum(s.stock), 0) < f.stock_minimo`
    );
    return filas.map((f) => ({
      registroId: f.id,
      entidad: 'formato',
      titulo: `Stock bajo de producto ${f.nombre}`,
      mensaje: `${Number(f.stock).toLocaleString('es-CL')} unidades (mínimo ${Number(f.stock_minimo).toLocaleString('es-CL')}).`,
      ruta: 'inventarios'
    }));
  }
};

/** Ventas vencidas con saldo (v1: alerts.js:93, "N ventas en mora"), ahora sobre el saldo real tras los cobros. */
export const ventasEnMora: Regla = {
  id: 'clientes.mora',
  modulo: 'clientes',
  severidad: 'bad',
  async evaluar(tx, { hoy }) {
    const filas = await tx.execute<{ saldo: string }>(sql`select saldo from v_por_cobrar where saldo > 0 and vencimiento is not null and vencimiento < ${hoy}`);
    if (!filas.length) return [];
    const total = filas.reduce((s, f) => s + Number(f.saldo), 0);
    return [{ titulo: `${filas.length} ventas en mora`, mensaje: `Total ${clp(total)} vencido.`, ruta: 'clientes?tab=por-cobrar' }];
  }
};
