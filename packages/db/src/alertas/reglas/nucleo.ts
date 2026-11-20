/** Reglas del núcleo. */
import { diffDays } from '@winzer/domain';
import { listarTemporadas } from '../../services/temporadas';
import type { Regla } from '../motor';

/** Días después del término de una temporada para pedir que se cierre. */
const DIAS_PARA_CERRAR = 30;

/** Una temporada que terminó hace más de 30 días y sigue abierta: conviene cerrarla para que quede de solo lectura. */
export const temporadaSinCerrar: Regla = {
  id: 'nucleo.temporada_sin_cerrar',
  modulo: 'configuracion',
  severidad: 'info',
  async evaluar(tx, { hoy }) {
    return (await listarTemporadas(tx))
      .filter((t) => t.estado === 'abierta' && (diffDays(t.fin, hoy) ?? 0) > DIAS_PARA_CERRAR)
      .map((t) => ({
        registroId: t.id,
        entidad: 'temporada',
        titulo: `Cierra la temporada ${t.anio}`,
        mensaje: `Terminó el ${t.fin.split('-').reverse().join('-')}. Al cerrarla, sus registros quedan de solo lectura.`,
        ruta: 'configuracion#temporadas'
      }));
  }
};
