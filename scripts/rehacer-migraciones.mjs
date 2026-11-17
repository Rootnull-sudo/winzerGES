#!/usr/bin/env node
/**
 * Rehace las migraciones de tu rama sobre las de main.
 *
 * Problema: si tú y tu compañero generan una migración en paralelo, ambas se llaman 0002_* y
 * packages/db/drizzle/meta/_journal.json choca. Las migraciones generadas NO se fusionan a mano:
 * se descartan las de tu rama y se regeneran desde tu schema.ts (que sí se fusiona normal).
 *
 * Uso (después de `git rebase origin/main` o durante el conflicto):
 *   npm run db:rehacer -- <nombre-de-tu-migracion>        (base: origin/main)
 *   BASE=upstream/main npm run db:rehacer -- clientes-giro
 *
 * Qué hace:
 *   1. Restaura packages/db/drizzle/ tal como está en la base.
 *   2. Quita las migraciones que solo existen en tu rama. Si alguna era "custom" (SQL escrito a mano),
 *      la copia a packages/db/drizzle-pendientes/ para que la vuelvas a crear con --custom.
 *   3. Corre `drizzle-kit generate --name <nombre>` con tu schema.ts ya fusionado.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const DIR = 'packages/db/drizzle';
const PEND = 'packages/db/drizzle-pendientes';
const base = process.env.BASE || 'origin/main';
const name = process.argv[2];
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();

if (!name || !/^[a-z0-9-]+$/.test(name)) {
  console.error('Uso: npm run db:rehacer -- <nombre-en-minusculas-con-guiones>');
  process.exit(1);
}
try {
  git('rev-parse', '--verify', base);
} catch {
  console.error(`✗ No existe la referencia ${base}. Corre "git fetch origin" primero.`);
  process.exit(1);
}

const enBase = new Set(git('ls-tree', '-r', '--name-only', base, '--', DIR).split('\n').filter(Boolean));
const local = [];
(function walk(d) {
  for (const f of readdirSync(join(ROOT, d))) {
    const p = join(d, f);
    statSync(join(ROOT, p)).isDirectory() ? walk(p) : local.push(p);
  }
})(DIR);

const propias = local.filter((p) => !enBase.has(p));
const custom = propias.filter((p) => p.endsWith('.sql') && /Custom SQL migration file/.test(readFileSync(join(ROOT, p), 'utf8')));

if (custom.length) {
  mkdirSync(join(ROOT, PEND), { recursive: true });
  for (const p of custom) copyFileSync(join(ROOT, p), join(ROOT, PEND, p.split('/').pop()));
}
for (const p of propias) rmSync(join(ROOT, p));
git('checkout', base, '--', DIR);

console.log(`↺ Migraciones restauradas desde ${base}. Quitadas de tu rama: ${propias.length ? '\n  - ' + propias.join('\n  - ') : 'ninguna'}`);
execFileSync('npx', ['drizzle-kit', 'generate', '--name', name], { cwd: join(ROOT, 'packages/db'), stdio: 'inherit' });

const nuevas = git('status', '--porcelain', '--', DIR).split('\n').filter(Boolean);
console.log(`\n✓ Listo. Archivos nuevos/cambiados:\n${nuevas.map((l) => '  ' + l).join('\n') || '  (ninguno: tu rama no tenía cambios de esquema)'}`);
if (custom.length) {
  console.log(`\n⚠ Tenías migraciones SQL escritas a mano. Están en ${relative(ROOT, join(ROOT, PEND))}/.`);
  console.log('  Créalas de nuevo con: cd packages/db && npx drizzle-kit generate --custom --name <nombre> y pega su contenido.');
}
console.log('\nSiguiente: npm run db:reset && npm run db:migrate   (tu base local tenía aplicada la versión anterior)');
