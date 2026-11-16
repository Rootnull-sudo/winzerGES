/**
 * data/backup.js — Respaldo y restauración.
 *  - JSON completo (todas las entidades + preferencias): lo recomendado para respaldar.
 *  - CSV por entidad (sin pérdida: los campos compuestos se guardan como JSON en la celda).
 *
 * ⚠ Los respaldos contienen datos reales del negocio: guárdalos fuera de GitHub
 *   (nube privada, USB). El .gitignore ya excluye archivos *backup*.json.
 */
(function (VG) {
  'use strict';
  const U = VG.utils;

  const B = {
    exportJSON() {
      const d = VG.db.dump();
      U.download(`winzer-gestion-backup-${U.today()}.json`, JSON.stringify(d, null, 1), 'application/json');
      VG.db.setMeta('lastBackup', new Date().toISOString());
      return d;
    },
    async importJSON(file) {
      const text = await U.readFile(file);
      let d; try { d = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
      await VG.db.load(d);
      return Object.values(d.data).reduce((a, x) => a + x.length, 0);
    },
    /** CSV de una entidad con todas sus columnas. */
    exportCSV(entity) {
      const rows = VG.db.list(entity);
      const keys = Array.from(rows.reduce((s, r) => { Object.keys(r).forEach(k => s.add(k)); return s; }, new Set()));
      const cols = keys.map(k => ({ key: k, label: k, csv: r => (r[k] !== null && typeof r[k] === 'object') ? JSON.stringify(r[k]) : r[k] }));
      U.download(`${entity}_${U.today()}.csv`, U.toCSV(rows, cols), 'text/csv;charset=utf-8');
      return rows.length;
    },
    /** Importa CSV de una entidad (agrega o actualiza por id). */
    async importCSV(entity, file) {
      const rows = U.parseCSV(await U.readFile(file));
      if (rows.length < 2) throw new Error('El CSV no tiene filas de datos.');
      const head = rows[0].map(h => h.trim());
      const recs = rows.slice(1).map(r => {
        const o = {};
        head.forEach((h, i) => {
          let v = r[i];
          if (v === undefined) return;
          if (/^[\[{]/.test(v)) { try { v = JSON.parse(v); } catch (e) { } }
          else if (v === 'true' || v === 'false') v = v === 'true';
          else if (/^-?\d+(\.\d+)?$/.test(v) && !/^(rut|folio|codigo|numero|telefono)$/i.test(h) && !/^0\d/.test(v)) v = Number(v);
          o[h] = v;
        });
        return o;
      });
      await VG.db.saveMany(entity, recs, { system: false });
      return recs.length;
    }
  };
  VG.backup = B;
})(window.VG);
