import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { login, newSession, waitSynced } from './helpers';

const shots = (name: string) => ({ path: resolve(import.meta.dirname, '../test-results/screens', name + '.png'), fullPage: true });

test('(a) un usuario en dos viñas ve datos distintos en cada una', async ({ page }) => {
  await login(page, 'admin@winzer.test');
  await expect(page).toHaveURL(/\/onboarding/);
  await page.screenshot(shots('01-onboarding'));
  await page.getByRole('link', { name: /Viña Demo/ }).click();
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Catastro vitícola' }).click();
  await expect(page.getByRole('cell', { name: 'C-01' })).toBeVisible();
  await expect(page.getByText('R-01')).toHaveCount(0);
  await page.screenshot(shots('02-catastro-demo'));

  await page.locator('summary', { hasText: 'Viña Demo' }).click();
  await page.getByRole('link', { name: 'Viña Los Robles' }).click();
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Catastro vitícola' }).click();
  await expect(page.getByRole('cell', { name: 'R-01' })).toBeVisible();
  await expect(page.getByText('C-01')).toHaveCount(0);
});

test('(b) el rol Ventas no accede a catastro: ni en la UI ni por la API', async ({ page }) => {
  await login(page, 'ventas@winzer.test');
  await expect(page).toHaveURL(/\/vina-demo$/);
  await expect(page.getByRole('navigation', { name: 'Módulos' }).getByText('Catastro vitícola')).toHaveCount(0);
  await page.goto('/vina-demo/catastro');
  await expect(page.getByText('Sin acceso')).toBeVisible();
  const res = await page.request.post('/api/vina-demo/sync/push', {
    data: {
      mutations: [
        {
          mutationId: crypto.randomUUID(),
          entity: 'cuartel',
          op: 'upsert',
          id: crypto.randomUUID(),
          baseVersion: null,
          data: { codigo: 'HACK', variedad: 'País', tipo: 'tinto', superficie: 1 },
          createdAt: new Date().toISOString()
        }
      ]
    }
  });
  const body = await res.json();
  expect(body.results[0].status).toBe('rejected');
  expect(body.results[0].message).toMatch(/no tiene permiso/);
  // Y no ve otra viña aunque conozca su dirección
  expect((await page.goto('/los-robles'))?.status()).toBe(404);
  expect((await page.request.get('/api/los-robles/sync/pull')).status()).toBe(404);
});

test('(c) crear y editar un cuartel sin conexión y sincronizar al volver', async ({ page, context, browser }) => {
  const codigo = 'OFF-' + Date.now().toString(36).slice(-5).toUpperCase();
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/catastro');
  await waitSynced(page);
  await expect(page.getByRole('cell', { name: 'C-01' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo cuartel' }).click();
  await page.getByLabel('Código').fill(codigo);
  await page.getByLabel('Variedad').fill('Chardonnay');
  await expect(page.getByLabel('Tipo de uva')).toHaveValue('blanco');
  await page.getByLabel(/Superficie/).fill('1,75');
  await page.getByLabel(/Densidad/).fill('4000');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Guardado en este equipo')).toBeVisible();
  await expect(page.getByRole('cell', { name: codigo })).toBeVisible();
  await expect(page.locator('table').getByLabel('Pendiente de sincronizar')).toBeVisible();
  // Código duplicado se rechaza localmente, sin red
  await page.getByRole('button', { name: 'Nuevo cuartel' }).click();
  await page.getByLabel('Código').fill(codigo.toLowerCase());
  await page.getByLabel('Variedad').fill('Syrah');
  await page.getByLabel(/Superficie/).fill('1');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('Ya existe un cuartel con ese código.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await page.screenshot(shots('03-catastro-offline'));

  await context.setOffline(false);
  await waitSynced(page);
  await expect(page.getByLabel('Pendiente de sincronizar')).toHaveCount(0);
  // Los datos ya sincronizados siguen ahí junto al nuevo
  await expect(page.getByRole('cell', { name: 'C-01' })).toBeVisible();

  // Otra sesión (otro dispositivo) lo ve, con las plantas calculadas en servidor
  const other = await newSession(browser, 'admin@winzer.test');
  await other.page.goto('/vina-demo/catastro');
  const row = other.page.getByRole('row', { name: new RegExp(codigo) });
  await expect(row).toBeVisible();
  await expect(row).toContainText('7.000');
  // Limpieza
  await row.click();
  other.page.once('dialog', (d) => d.accept());
  await other.page.getByRole('button', { name: 'Eliminar' }).click();
  await expect(other.page.getByRole('row', { name: new RegExp(codigo) })).toHaveCount(0);
  await other.ctx.close();
  await expect(page.getByRole('cell', { name: codigo })).toHaveCount(0, { timeout: 40_000 });
});

test('(d) importar un respaldo de v1 y ver clientes y cuarteles', async ({ page }) => {
  await login(page, 'admin@winzer.test');
  await page.goto('/onboarding');
  const nombre = 'Viña Import ' + Date.now().toString(36);
  await page.getByLabel('Nombre de la viña').fill(nombre);
  await page.getByRole('button', { name: 'Crear viña' }).click();
  await page.waitForURL(/\/vina-import-/);
  const slug = new URL(page.url()).pathname.split('/')[1];
  await page.goto(`/${slug}/configuracion`);
  const dump = JSON.parse(readFileSync(resolve(import.meta.dirname, 'fixtures/respaldo-v1.json'), 'utf8'));
  await page.locator('input[type=file]').setInputFiles({ name: 'respaldo.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(dump)) });
  await expect(page.getByText('Importación terminada')).toBeVisible();
  await expect(page.getByText('✓ 2 cuartel')).toBeVisible();
  await expect(page.getByText('✓ 2 cliente')).toBeVisible();
  await expect(page.getByText(/venta \(1\)/)).toBeVisible();
  await page.screenshot(shots('04-importar'));
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Clientes y cobranza' }).click();
  await expect(page.getByRole('cell', { name: /Vinoteca Importada/ })).toBeVisible();
  await page.screenshot(shots('05-clientes'));
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Catastro vitícola' }).click();
  await expect(page.getByRole('cell', { name: 'IM-02' })).toBeVisible();
});

test('clientes online: RUT inválido se rechaza, válido se guarda', async ({ page }) => {
  await login(page, 'ventas@winzer.test');
  await page.goto('/vina-demo/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  const nombre = 'Bar de prueba ' + Date.now().toString(36);
  await page.getByLabel('Nombre o razón social').fill(nombre);
  await page.getByLabel('RUT').fill('12.345.678-0');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByText('RUT inválido')).toBeVisible();
  await page.getByLabel('RUT').fill('12.345.678-5');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('cell', { name: nombre })).toBeVisible();
  await expect(page.getByRole('row', { name: new RegExp(nombre) })).toContainText('12.345.678-5');
});

test('móvil: catastro en tarjetas y menú lateral @mobile', async ({ page }) => {
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/catastro');
  await expect(page.getByRole('button', { name: /C-01/ })).toBeVisible();
  await page.screenshot(shots('06-movil-catastro'));
  await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeInViewport();
  await page.screenshot(shots('07-movil-menu'));
});
