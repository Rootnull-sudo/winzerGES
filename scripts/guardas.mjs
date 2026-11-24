#!/usr/bin/env node
/**
 * Guardas de arquitectura (corren en `npm run check` y en CI). Cada una protege una regla que,
 * si se rompe en una rama, no la detectan ni TypeScript ni los tests de la otra persona.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const WEB = join(ROOT, 'apps/web/src');
const errores = [];

function archivos(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) archivos(p, out);
    else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p);

for (const f of archivos(WEB)) {
  const src = readFileSync(f, 'utf8');
  // 1. La app nunca usa la conexión de administración: se saltaría Row-Level Security.
  if (/\badminDb\b/.test(src)) errores.push(`${rel(f)}: usa adminDb (salta RLS). Usa withOrg(actor.orgId, …).`);
  // 2. Los componentes de cliente no importan la base de datos (filtraría código y credenciales al navegador).
  if (/^['"]use client['"]/.test(src.trimStart()) && /from ['"]@winzer\/db['"]/.test(src))
    errores.push(`${rel(f)}: componente 'use client' importa @winzer/db.`);
  // 3. Escrituras de negocio solo vía repo (permisos + versión + auditoría), no insert/update directos en la app.
  const directa = src.match(/\btx\.(insert|update|delete)\(/);
  if (directa) errores.push(`${rel(f)}: escribe directo con tx.${directa[1]}. Usa upsert/softDelete de @winzer/db.`);
}

// 4. Módulos marcados como migrados ('v2') tienen página, y cada página de módulo está marcada como migrada.
const modulos = readFileSync(join(ROOT, 'packages/domain/src/modules.ts'), 'utf8');
const v2 = [...modulos.matchAll(/m\('([a-z]+)'.*'v2'\)/g)].map((x) => x[1]);
const ORG = join(WEB, 'app/[org]');
const paginas = readdirSync(ORG).filter((d) => statSync(join(ORG, d)).isDirectory() && d !== 'm' && readdirSync(join(ORG, d)).includes('page.tsx'));
for (const id of v2) if (!paginas.includes(id)) errores.push(`modules.ts marca '${id}' como 'v2' pero no existe apps/web/src/app/[org]/${id}/page.tsx`);
for (const p of paginas) if (!v2.includes(p)) errores.push(`existe app/[org]/${p}/page.tsx pero '${p}' no está marcado status 'v2' en modules.ts`);

if (errores.length) {
  console.error('✗ Guardas de arquitectura:\n  - ' + errores.join('\n  - '));
  process.exit(1);
}
console.log(`✓ Guardas de arquitectura (${v2.length} módulos v2)`);
