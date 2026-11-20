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

test('temporadas: selector en la barra superior y validación en configuración', async ({ page, browser }) => {
  // Temporada actual = año de la vendimia que contiene hoy (julio en adelante → año siguiente). El seed crea anterior, actual y siguiente.
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());
  const actual = Number(hoy.slice(0, 4)) + (Number(hoy.slice(5, 7)) >= 7 ? 1 : 0);
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/catastro');
  const selector = page.getByLabel('Temporada', { exact: true });
  await expect(selector).toHaveValue(String(actual));
  await selector.selectOption(String(actual - 1));
  await expect(page).toHaveURL(new RegExp(`/vina-demo/catastro\\?t=${actual - 1}$`));
  // La temporada elegida viaja al cambiar de módulo.
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Dashboard' }).click();
  await expect(page).toHaveURL(new RegExp(`/vina-demo\\?t=${actual - 1}$`));
  await expect(page.getByLabel('Temporada', { exact: true })).toHaveValue(String(actual - 1));
  await page.screenshot(shots('08-temporada-anterior'));

  const admin = await newSession(browser, 'admin@winzer.test');
  await admin.page.goto('/vina-demo/configuracion');
  await expect(admin.page.getByRole('row', { name: new RegExp(`${actual}.*Actual`) })).toBeVisible();
  await admin.page.screenshot(shots('09-temporadas-config'));
  await admin.page.getByRole('button', { name: 'Nueva temporada' }).click();
  await admin.page.getByLabel('Año de vendimia').fill(String(actual));
  await admin.page.getByRole('button', { name: 'Guardar' }).click();
  await expect(admin.page.getByRole('dialog').getByRole('alert')).toContainText(`Ya existe la temporada ${actual}`);
  await admin.ctx.close();
});

test('parámetros con vigencia: cambiar el PPM, ver la historia y volver al valor por defecto', async ({ page }) => {
  await login(page, 'admin@winzer.test');
  await page.goto('/vina-demo/configuracion');
  const fila = page.getByRole('listitem').filter({ hasText: /^PPM/ });
  await expect(fila).toContainText('0,25 %');
  await page.getByRole('button', { name: 'Cambiar PPM' }).click();
  const dialogo = page.getByRole('dialog');
  await dialogo.getByLabel('Valor').fill('150');
  await dialogo.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialogo.getByText('Una tasa va entre 0 y 100 %.')).toBeVisible();
  await dialogo.getByLabel('Valor').fill('0,3');
  await dialogo.getByRole('button', { name: 'Guardar' }).click();
  await expect(fila).toContainText('0,3 %');
  await expect(fila).toContainText('Desde el');
  await page.screenshot(shots('10-parametros'));

  await page.getByRole('button', { name: 'Cambiar PPM' }).click();
  await dialogo.getByRole('button', { name: /Quitar el valor desde/ }).click();
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(fila).toContainText('0,25 %');
  await expect(fila).toContainText('Valor por defecto');
});

test('campana de avisos: el admin ve la temporada sin cerrar; el agrónomo no la ve', async ({ page, browser }) => {
  await login(page, 'admin@winzer.test');
  await page.goto('/vina-demo');
  await page.getByRole('button', { name: /^Avisos/ }).click();
  const panel = page.getByRole('region', { name: 'Avisos' });
  await expect(panel.getByText(/Cierra la temporada \d{4}/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Avisos', exact: true })).toBeVisible();
  await page.screenshot(shots('11-campana'));
  await panel.getByRole('link', { name: /Cierra la temporada/ }).click();
  await expect(page).toHaveURL(/\/vina-demo\/configuracion#temporadas$/);
  await expect(panel).toHaveCount(0);

  const agro = await newSession(browser, 'agronomo@winzer.test');
  await agro.page.goto('/vina-demo');
  await agro.page.getByRole('button', { name: /^Avisos/ }).click();
  await expect(agro.page.getByText('Sin avisos pendientes.')).toBeVisible();
  await agro.ctx.close();
});

test('plan Esencial: finanzas aparece con candado y la página explica el plan', async ({ page }) => {
  await login(page, 'admin@winzer.test');
  await page.goto('/los-robles');
  const financiero = page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Financiero' });
  await expect(financiero).toHaveAttribute('title', 'Disponible en el plan Completo');
  await financiero.click();
  await expect(page.getByText('Disponible en el plan Completo')).toBeVisible();
  await page.screenshot(shots('12-plan-esencial'));
  await page.goto('/los-robles/configuracion');
  await expect(page.getByText(/Esencial · Activa/)).toBeVisible();
});

test('adjuntos: subir un PDF a un cliente, descargarlo y quitarlo', async ({ page, browser }) => {
  await login(page, 'admin@winzer.test');
  await page.goto('/vina-demo/clientes');
  await page.getByRole('row').nth(1).click();
  const dialogo = page.getByRole('dialog');
  const adjuntos = dialogo.getByRole('region', { name: 'Adjuntos' });
  const nombre = `contrato-${Date.now().toString(36)}.pdf`;
  await adjuntos.locator('input[type=file]').setInputFiles({ name: nombre, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 contrato de prueba') });
  await expect(adjuntos.getByText(nombre)).toBeVisible();
  await page.screenshot(shots('13-adjuntos'));

  // Ventas (clientes: ver, crear, editar, exportar) puede descargar pero no quitar.
  const ventas = await newSession(browser, 'ventas@winzer.test');
  await ventas.page.goto('/vina-demo/clientes');
  const cliente = await dialogo.getByRole('heading').first().innerText();
  await ventas.page.getByRole('cell', { name: cliente, exact: true }).first().click();
  const adjVentas = ventas.page.getByRole('dialog').getByRole('region', { name: 'Adjuntos' });
  await expect(adjVentas.getByRole('button', { name: `Descargar ${nombre}` })).toBeVisible();
  await expect(adjVentas.getByRole('button', { name: `Quitar ${nombre}` })).toHaveCount(0);
  await ventas.ctx.close();

  const [descarga] = await Promise.all([page.waitForEvent('download'), adjuntos.getByRole('button', { name: `Descargar ${nombre}` }).click()]);
  expect(descarga.suggestedFilename()).toBe(nombre);

  page.once('dialog', (d) => d.accept());
  await adjuntos.getByRole('button', { name: `Quitar ${nombre}` }).click();
  await expect(adjuntos.getByText(nombre)).toHaveCount(0);
});

test('resumen diario por correo: se activa desde la campana y se recuerda', async ({ page }) => {
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo');
  await page.getByRole('button', { name: /^Avisos/ }).click();
  const casilla = page.getByRole('checkbox', { name: /resumen diario por correo/ });
  await expect(casilla).not.toBeChecked();
  await casilla.check();
  await page.waitForTimeout(500);
  await page.reload();
  await page.getByRole('button', { name: /^Avisos/ }).click();
  await expect(casilla).toBeChecked();
  await casilla.uncheck();
  await page.waitForTimeout(500);
});

test('insumos: crear en línea, ajustar stock y consultar sin conexión (sin poder editar)', async ({ page, context }) => {
  const nombre = 'Azufre E2E';
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/insumos');
  await waitSynced(page);
  const fila = page.getByRole('row', { name: new RegExp(nombre) });
  // Idempotente: el insumo se crea la primera vez (tiene movimientos, así que no se puede borrar).
  if ((await fila.count()) === 0) {
    await page.getByRole('button', { name: 'Nuevo insumo' }).first().click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Nombre').fill(nombre);
    await d.getByLabel('Tipo').selectOption('Fungicida');
    await d.getByLabel(/Precio por unidad/).fill('1800');
    await d.getByLabel('Stock inicial').fill('50');
    await d.getByLabel(/Carencia/).fill('7');
    await d.getByRole('button', { name: 'Guardar' }).click();
    await expect(fila).toBeVisible();
  }
  const stockAntes = Number(((await fila.getByRole('cell').nth(4).innerText()).split(' ')[0] ?? '0').replace(/\./g, '').replace(',', '.'));
  await fila.click();
  await page.getByRole('button', { name: 'Ajustar stock' }).click();
  const aj = page.getByRole('dialog', { name: /Ajustar stock/ });
  await aj.getByLabel('Cómo ajustar').selectOption('diferencia');
  await aj.getByLabel('Diferencia').fill('1');
  await aj.getByLabel('Motivo').fill('Ingreso sin compra');
  await aj.getByRole('button', { name: 'Registrar ajuste' }).click();
  await expect(fila.getByRole('cell').nth(4)).toContainText(String(stockAntes + 1).replace('.', ','));
  await page.screenshot(shots('14-insumos'));

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await expect(page.getByText(/crear, editar o ajustar insumos requiere señal/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nuevo insumo' }).first()).toBeDisabled();
  await fila.click();
  await expect(page.getByRole('dialog').getByLabel('Nombre')).toBeDisabled();
  await page.keyboard.press('Escape');
  await context.setOffline(false);
});

test('fenología: desborre y temperatura sin conexión, con grados día y Winkler', async ({ page, context }) => {
  const estacion = 'E2E-' + Date.now().toString(36).slice(-5);
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/fenologia');
  await waitSynced(page);

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar desborre' }).click();
  const d = page.getByRole('dialog', { name: 'Registrar desborre' });
  await d.getByLabel('Cuartel').selectOption({ label: 'C-01 · Sauvignon Blanc' });
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /C-01/ });
  await expect(fila).toBeVisible();
  await expect(fila.getByLabel('Pendiente de sincronizar')).toBeVisible();

  await page.getByRole('tab', { name: 'Temperaturas y grados día' }).click();
  await page.getByRole('button', { name: 'Registrar día' }).click();
  const c = page.getByRole('dialog', { name: 'Registrar día' });
  await c.getByLabel('Estación').fill(estacion);
  await c.getByLabel('Temperatura máxima').fill('28');
  await c.getByLabel('Temperatura mínima').fill('12');
  await expect(c.getByText('10,0')).toBeVisible();
  await c.getByRole('button', { name: 'Guardar' }).click();
  const dia = page.getByRole('row', { name: new RegExp(estacion) });
  await expect(dia).toBeVisible();
  await expect(page.getByText(/Región I|Región II|Región III|Región IV|Región V/).first()).toBeVisible();
  await page.screenshot(shots('15-clima-offline'));

  await context.setOffline(false);
  await waitSynced(page);
  // Limpieza (para poder repetir la prueba).
  await dia.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(dia).toHaveCount(0);
  await page.getByRole('tab', { name: 'Desborre y fenología' }).click();
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);
});
