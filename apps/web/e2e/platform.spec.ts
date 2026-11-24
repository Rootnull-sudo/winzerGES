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
  await expect(page.getByText(/dte \(1\)/)).toBeVisible(); // pendiente hasta F6
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

test('campana de avisos: el admin ve la temporada sin cerrar; el agrónomo solo ve los de sus módulos', async ({ page, browser }) => {
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
  const panelAgro = agro.page.getByRole('region', { name: 'Avisos' });
  await expect(panelAgro.getByText(/desborre/).first()).toBeVisible(); // fenología (datos de demo)
  await expect(panelAgro.getByText(/Cierra la temporada/)).toHaveCount(0); // configuración: no es de su rol
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
  // El primer cuartel sin registro en la temporada (si una corrida anterior falló a mitad, no choca).
  const libre = d.getByLabel('Cuartel').locator('option:not([disabled])').first();
  const codigo = ((await libre.innerText()).split(' · ')[0] ?? '').trim();
  await d.getByLabel('Cuartel').selectOption(await libre.getAttribute('value'));
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: new RegExp(codigo) });
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

test('aplicaciones: una aplicación sin conexión descuenta el stock al sincronizar', async ({ page, context }) => {
  const insumo = 'Azufre E2E';
  const stockDe = async () =>
    Number(
      (
        (
          await page
            .getByRole('row', { name: new RegExp(insumo) })
            .getByRole('cell')
            .nth(4)
            .innerText()
        ).split(' ')[0] ?? '0'
      )
        .replace(/\./g, '')
        .replace(',', '.')
    );
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/insumos');
  await waitSynced(page);
  if ((await page.getByRole('row', { name: new RegExp(insumo) }).count()) === 0) {
    await page.getByRole('button', { name: 'Nuevo insumo' }).first().click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Nombre').fill(insumo);
    await d.getByLabel(/Precio por unidad/).fill('1800');
    await d.getByLabel('Stock inicial').fill('50');
    await d.getByLabel(/Carencia/).fill('7');
    await d.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('row', { name: new RegExp(insumo) })).toBeVisible();
  }
  const antes = await stockDe();

  await page.getByRole('tab', { name: 'Aplicaciones' }).click();
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar aplicación' }).click();
  const d = page.getByRole('dialog', { name: 'Registrar aplicación' });
  await d.getByLabel('Cuartel').selectOption({ index: 1 });
  await d.getByLabel('Insumo').selectOption({ label: `${insumo} (kg)` });
  await expect(d.getByLabel(/Carencia/)).toHaveValue('7');
  await d.getByLabel(/Dosis por hectárea/).fill('2');
  const cantidad = Number(await d.getByLabel(/Cantidad aplicada/).inputValue());
  expect(cantidad).toBeGreaterThan(0);
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: new RegExp(insumo) });
  await expect(fila.getByLabel('Pendiente de sincronizar')).toBeVisible();
  await page.screenshot(shots('16-aplicacion-offline'));

  await context.setOffline(false);
  await waitSynced(page);
  await page.getByRole('tab', { name: 'Insumos', exact: true }).click();
  await expect.poll(stockDe, { timeout: 20_000 }).toBe(Math.round((antes - cantidad) * 100) / 100);
  // El servidor recalcula las alertas tras el push: aparece la carencia vigente en la campana.
  await expect
    .poll(
      async () => {
        await page.reload();
        await page.getByRole('button', { name: /^Avisos/ }).click();
        return page
          .getByRole('region', { name: 'Avisos' })
          .getByText(/Carencia vigente en/)
          .count();
      },
      { timeout: 20_000 }
    )
    .toBeGreaterThan(0);
  await page.keyboard.press('Escape');

  // Limpieza: borrar la aplicación devuelve el stock.
  await page.getByRole('tab', { name: 'Aplicaciones' }).click();
  await page
    .getByRole('row', { name: new RegExp(insumo) })
    .first()
    .click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await waitSynced(page);
  await page.getByRole('tab', { name: 'Insumos', exact: true }).click();
  await expect.poll(stockDe, { timeout: 20_000 }).toBe(antes);
});

test('cosecha: una cuadrilla registrada sin señal queda con su pago calculado', async ({ page, context }) => {
  const cuadrilla = 'Cuadrilla E2E ' + Date.now().toString(36).slice(-4);
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/cosecha');
  await waitSynced(page);

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar cosecha' }).click();
  const d = page.getByRole('dialog');
  await d.getByLabel('Cuartel').selectOption({ index: 1 });
  await d.getByLabel('Cajones').fill('100');
  await d.getByLabel(/^Kg\b/).fill('2500');
  await d.getByRole('button', { name: 'Guardar y agregar personal' }).click();
  await expect(d.getByText(/fuera del rango/)).toBeVisible(); // 25 kg/cajón: se corrige antes de guardar
  await d.getByLabel(/^Kg\b/).fill('1900');
  await d.getByRole('button', { name: 'Guardar y agregar personal' }).click();

  const personal = page.getByRole('dialog').getByRole('region', { name: 'Personal y pagos' });
  await expect(personal).toBeVisible();
  const form = personal.getByRole('form', { name: 'Agregar personal' });
  await form.getByLabel('Nombre o cuadrilla').fill(cuadrilla);
  await form.getByLabel('Trabajadores').fill('6');
  await form.getByLabel('Cajones').fill('100');
  await expect(form.getByText('$65.000')).toBeVisible();
  await form.getByRole('button', { name: 'Agregar' }).click();
  await expect(personal.getByText(cuadrilla)).toBeVisible();
  await expect(personal.getByText(/Total\s*\$65\.000/)).toBeVisible();
  await page.screenshot(shots('17-cosecha-offline'));

  await context.setOffline(false);
  await waitSynced(page);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'Personal y pagos' }).click();
  await expect(page.getByRole('row', { name: new RegExp(cuadrilla) })).toContainText('$65.000');

  // Limpieza: borrar la cosecha borra su personal.
  await page.getByRole('row', { name: new RegExp(cuadrilla) }).click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await waitSynced(page);
  await expect(page.getByRole('row', { name: new RegExp(cuadrilla) })).toHaveCount(0);
});

test('calendario: lote creado sin señal, en el Gantt, y la cosecha lo pasa a «En vendimia»', async ({ page, context }) => {
  const codigo = 'L-E2E-' + Date.now().toString(36).slice(-4).toUpperCase();
  await login(page, 'agronomo@winzer.test');
  await page.goto('/vina-demo/calendario');
  await waitSynced(page);

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo lote' }).click();
  const d = page.getByRole('dialog', { name: 'Nuevo lote' });
  await d.getByLabel('Código del lote').fill(codigo);
  await d.getByLabel('Variedad').fill('Syrah');
  await d.getByLabel('Valle').fill('Maipo');
  const anio = Number((await page.getByRole('combobox', { name: 'Temporada' }).first().inputValue()) || '0');
  await d.getByLabel('Vendimia planificada').fill(`${anio}-03-15`);
  await expect(d.getByLabel('Plan', { exact: true })).toContainText('FML');
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: new RegExp(codigo) });
  await expect(fila.getByLabel('Pendiente de sincronizar')).toBeVisible();
  await expect(fila).toContainText('Planificado');

  await page.getByRole('tab', { name: 'Vista Gantt' }).click();
  await expect(page.getByRole('region', { name: 'Gantt de lotes' }).getByText(codigo)).toBeVisible();
  await page.screenshot(shots('18-gantt'));
  await context.setOffline(false);
  await waitSynced(page);

  // La cosecha con ese lote lo pasa a «En vendimia».
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Cosecha' }).click();
  await page.getByRole('button', { name: 'Registrar cosecha' }).click();
  const c = page.getByRole('dialog');
  await c.getByLabel('Cuartel').selectOption({ index: 1 });
  await c.getByLabel('Lote').selectOption({ label: `${codigo} · Syrah` });
  await c.getByLabel('Cajones').fill('10');
  await c.getByLabel(/^Kg\b/).fill('190');
  await c.getByRole('button', { name: 'Guardar y agregar personal' }).click();
  await expect(c.getByRole('region', { name: 'Personal y pagos' })).toBeVisible();
  await waitSynced(page);
  await page.keyboard.press('Escape');
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Calendario de vendimia' }).click();
  await expect
    .poll(async () => (await page.getByRole('row', { name: new RegExp(codigo) }).innerText()).includes('En vendimia'), { timeout: 20_000 })
    .toBe(true);

  // Limpieza.
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Cosecha' }).click();
  await page.getByRole('row', { name: /190/ }).first().click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await page.getByRole('navigation', { name: 'Módulos' }).getByRole('link', { name: 'Calendario de vendimia' }).click();
  await page.getByRole('row', { name: new RegExp(codigo) }).click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('row', { name: new RegExp(codigo) })).toHaveCount(0);
});

test('bodega: un trasiego sin señal se sincroniza como una sola operación y la ocupación cuadra', async ({ page, context }) => {
  const litrosDe = async (codigo: string) =>
    Number(
      (
        (
          await page
            .getByRole('list', { name: 'Estanques' })
            .getByRole('button', { name: new RegExp(`^${codigo}`) })
            .innerText()
        ).match(/([\d.]+) L \//)?.[1] ?? '0'
      ).replace(/\./g, '')
    );
  await login(page, 'enologo@winzer.test');
  await page.goto('/vina-demo/bodega?t=2026');
  await waitSynced(page);
  const [e1, e3] = [await litrosDe('E-01'), await litrosDe('E-03')];
  expect(e3).toBeGreaterThan(1000);

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Trasiego' }).click();
  const d = page.getByRole('dialog', { name: 'Registrar trasiego' });
  const origen = d.getByLabel('Estanque de origen');
  await origen.selectOption((await origen.locator('option', { hasText: 'E-03' }).getAttribute('value'))!);
  await d.getByLabel('Estanque de destino').selectOption({ index: 1 });
  const destino = ((await d.getByLabel('Estanque de destino').locator('option:checked').innerText()).split(' · ')[0] ?? '').trim();
  await d.getByLabel('Litros trasegados').fill('1000');
  await d.getByLabel(/Merma en el trasiego/).fill('20');
  await d.getByRole('button', { name: 'Registrar trasiego' }).click();
  await expect(d).toHaveCount(0);
  await expect.poll(() => litrosDe('E-03')).toBe(e3 - 1020);
  await page.screenshot(shots('19-bodega-offline'));

  await context.setOffline(false);
  await waitSynced(page);
  await page.reload();
  await waitSynced(page);
  await expect.poll(() => litrosDe('E-03')).toBe(e3 - 1020);
  if (destino === 'E-01') await expect.poll(() => litrosDe('E-01')).toBe(e1 + 1000);

  // Limpieza: borrar el trasiego completo (los tres movimientos juntos).
  await page.getByRole('tab', { name: 'Movimientos' }).click();
  page.once('dialog', (x) => x.accept());
  await page
    .getByRole('row', { name: /Trasiego \(salida\)/ })
    .first()
    .click();
  await waitSynced(page);
  await page.getByRole('tab', { name: 'Estanques' }).click();
  await expect.poll(() => litrosDe('E-03'), { timeout: 20_000 }).toBe(e3);
});

test('fermentación: ciclo de una ficha sin señal, con adición de SO₂ y aviso de intervalo', async ({ page, context }) => {
  const codigo = 'FA-E2E-' + Date.now().toString(36).slice(-4).toUpperCase();
  await login(page, 'enologo@winzer.test');
  await page.goto('/vina-demo/fermentacion');
  await waitSynced(page);

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva ficha' }).click();
  const d = page.getByRole('dialog', { name: 'Nueva ficha de fermentación' });
  await d.getByLabel('Lote').selectOption({ index: 1 });
  await d.getByLabel('Código de la ficha').fill(codigo);
  await d.getByLabel('Volumen').fill('3000');
  await d.getByLabel('Inicio FA', { exact: true }).fill(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date()));
  await d.getByRole('button', { name: 'Guardar' }).click();
  await page.getByRole('button', { name: new RegExp(codigo) }).click();
  await expect(page.getByRole('heading', { name: codigo })).toBeVisible();

  await page.getByRole('button', { name: 'Registrar seguimiento' }).click();
  const s = page.getByRole('dialog', { name: 'Registrar seguimiento' });
  await s.getByLabel('Densidad').fill('1090');
  await s.getByLabel('Temperatura').fill('34');
  await expect(s.getByText(/riesgo de parada/)).toBeVisible(); // aviso, no bloquea
  await s.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('list', { name: 'Avisos de la ficha' })).toContainText('Temperatura muy alta');

  await page.getByRole('button', { name: 'Adición de metabisulfito' }).click();
  const a = page.getByRole('dialog', { name: 'Adición de metabisulfito' });
  await a.getByRole('button', { name: 'Usar sugeridos' }).click();
  await a.getByRole('button', { name: 'Registrar adición' }).click();
  await expect(a).toHaveCount(0);
  // Segunda adición el mismo día: pide confirmar el intervalo mínimo.
  let mensaje = '';
  page.once('dialog', (x) => {
    mensaje = x.message();
    void x.dismiss();
  });
  await page.getByRole('button', { name: 'Adición de metabisulfito' }).click();
  await expect.poll(() => mensaje).toMatch(/mínimo recomendado 24 h/);
  await page.screenshot(shots('20-fermentacion-offline'));

  await context.setOffline(false);
  await waitSynced(page);
  await page.reload();
  await waitSynced(page);
  await expect(page.getByRole('heading', { name: codigo })).toBeVisible();
  await expect(page.getByText('Intervalo mínimo entre adiciones')).toBeVisible();

  // Limpieza: borrar la ficha (también su seguimiento y su adición).
  await page.getByRole('button', { name: 'Editar hitos y datos' }).click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('button', { name: new RegExp(codigo) })).toHaveCount(0);
});

test('vinificación: aditivo sin señal con conversión de unidades y costo enológico del lote', async ({ page, context }) => {
  await login(page, 'enologo@winzer.test');
  await page.goto('/vina-demo/vinificacion?t=2026');
  await waitSynced(page);
  const costo = page.getByRole('region', { name: 'Costo enológico por lote' }).getByRole('row', { name: /L-2026-SB/ });
  const antes = await costo.innerText();

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar aplicación' }).click();
  const d = page.getByRole('dialog', { name: 'Registrar aplicación' });
  await d.getByLabel('Lote').selectOption({ label: 'L-2026-SB · Sauvignon Blanc' });
  await d.getByLabel('Producto').selectOption({ label: 'Bentonita sódica (kg)' });
  await d.getByLabel('Volumen tratado').fill('2000');
  await d.getByLabel('Dosis').fill('50');
  await expect(d.getByLabel('Cálculo')).toContainText('1 kg'); // 50 g/hL × 2.000 L = 1.000 g
  await expect(d.getByLabel('Cálculo')).toContainText('$4.200');
  await d.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => costo.innerText()).not.toBe(antes);
  await page.screenshot(shots('21-vinificacion'));
  await context.setOffline(false);
  await waitSynced(page);

  // Limpieza.
  await page
    .getByRole('row', { name: /Bentonita sódica.*2\.000 L/ })
    .first()
    .click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect.poll(() => costo.innerText(), { timeout: 15_000 }).toBe(antes);
});

test('laboratorio: análisis sin señal con fuera de rango e informe adjunto al reconectar', async ({ page, context }) => {
  await login(page, 'enologo@winzer.test');
  await page.goto('/vina-demo/laboratorio?t=2026');
  await waitSynced(page);
  // Demo: el último análisis del Cabernet tiene pH y SO₂ libre fuera del rango de tintos.
  await expect(page.getByRole('row', { name: /20 ago 2026.*L-2026-CS/ }).getByText('pH', { exact: true })).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo análisis' }).click();
  const d = page.getByRole('dialog', { name: 'Nuevo análisis' });
  await d.getByLabel('Lote').selectOption({ label: 'L-2026-SB · Sauvignon Blanc' });
  await d.getByRole('textbox', { name: /^Laboratorio/ }).fill('Laboratorio E2E');
  await d.getByLabel('pH').fill('3.62');
  await d.getByLabel('SO₂ libre').fill('30');
  const comp = d.getByRole('complementary', { name: 'Comparación con rangos' });
  await expect(comp).toContainText('3,62 ⚠'); // blancos: 3,1–3,4
  await expect(comp).toContainText('30 ✓'); // SO₂ libre en blancos: 25–35 (parámetro de fermentación)
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Laboratorio E2E/ });
  await expect(fila.getByLabel('Pendiente de sincronizar')).toBeVisible();
  await expect(fila.getByText('pH', { exact: true })).toBeVisible();
  await page.screenshot(shots('22-laboratorio'));

  await context.setOffline(false);
  await waitSynced(page);
  await fila.click();
  const informe = page.getByRole('dialog').getByRole('region', { name: 'Adjuntos' });
  await informe.locator('input[type=file]').setInputFiles({ name: 'informe-e2e.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 informe') });
  await expect(informe.getByText('informe-e2e.pdf')).toBeVisible();

  // Limpieza.
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).first().click();
  await expect(fila).toHaveCount(0);
});

test('histórico kg y litros: trazabilidad por lote sin señal, con filtros', async ({ page, context }) => {
  await login(page, 'enologo@winzer.test');
  await page.goto('/vina-demo/historico');
  await waitSynced(page);
  await context.setOffline(true);
  await expect(page.getByRole('button', { name: /Sin conexión/ })).toBeVisible();
  const detalle = page.getByRole('region', { name: 'Detalle por lote' });
  const sb = detalle.getByRole('row', { name: /L-2026-SB/ });
  await expect(sb).toContainText('3.990'); // kg de la cosecha del lote
  await expect(sb).toContainText('0,69'); // 2.750 L / 3.990 kg
  await expect(page.getByRole('region', { name: 'Comparativa entre temporadas' }).getByRole('row', { name: /^2026/ })).toContainText('9.840');
  await detalle.getByRole('group', { name: 'Filtros' }).getByLabel('Tipo').selectOption('tinto');
  await expect(sb).toHaveCount(0);
  await expect(detalle.getByRole('row', { name: /L-2026-CS/ })).toBeVisible();
  await expect(page.getByLabel('Totales del detalle')).toContainText('5.850');
  await page.screenshot(shots('23-historico'));
  await context.setOffline(false);
});

test('proveedores: el administrativo crea un proveedor con RUT validado y lo elimina', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/proveedores?tab=proveedores');
  await expect(page.getByRole('row', { name: /Envases del Valle Demo SpA/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo proveedor' }).click();
  const d = page.getByRole('dialog', { name: 'Nuevo proveedor' });
  await d.getByRole('textbox', { name: /^Razón social/ }).fill('Proveedor E2E');
  await d.getByRole('textbox', { name: /^RUT/ }).fill('76.123.456-1');
  await d.getByRole('button', { name: 'Guardar' }).click();
  await expect(d.getByText(/dígito verificador/)).toBeVisible();
  await d.getByRole('textbox', { name: /^RUT/ }).fill('761234560');
  await d.getByLabel(/Plazo de pago/).fill('0');
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Proveedor E2E/ });
  await expect(fila).toContainText('76.123.456-0');
  await expect(fila).toContainText('Contado');
  await page.screenshot(shots('24-proveedores'));
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);
});

test('compras: factura de 2 líneas sube stock y precio; la NC baja stock y saldo; anular revierte', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/proveedores?tab=compras&t=2027');
  const folio = `E2E-${Date.now().toString(36)}`;
  const stockBotella = async (d: import('@playwright/test').Locator) =>
    Number(
      (await d.getByRole('list', { name: 'Insumos de la compra' }).innerText())
        .match(/Stock ([\d.,]+)/)![1]!
        .replace(/\./g, '')
        .replace(',', '.')
    );

  await page.getByRole('button', { name: 'Nueva compra' }).click();
  let d = page.getByRole('dialog', { name: 'Nueva compra' });
  await d.getByLabel('Proveedor', { exact: false }).first().selectOption({ label: 'Envases del Valle Demo SpA' });
  await d.getByRole('textbox', { name: /^Folio/ }).fill(folio);
  await d.getByLabel('Línea 1 · Insumo').selectOption({ label: 'Botella Bordelesa 750 mL (un)' });
  await d.getByLabel('Línea 1 · Cantidad').fill('100');
  await d.getByLabel('Línea 1 · Precio unitario').fill('450');
  const antes = await stockBotella(d);
  await d.getByRole('button', { name: 'Agregar línea' }).click();
  await d.getByLabel('Línea 2 · Descripción').fill('Flete');
  await d.getByLabel('Línea 2 · Precio unitario').fill('20000');
  await d.getByRole('listitem', { name: 'Línea 2' }).getByLabel('Exenta').check();
  const calc = d.getByRole('complementary', { name: 'Cálculo' });
  await expect(calc).toContainText('$45.000'); // neto afecto
  await expect(calc).toContainText('$8.550'); // IVA 19 %
  await expect(calc).toContainText('$73.550'); // + exento 20.000
  await page.screenshot(shots('25-compra'));
  await d.getByRole('button', { name: 'Guardar' }).click();
  const factura = page.getByRole('row', { name: new RegExp(`Factura ${folio}\\b`) });
  await expect(factura).toContainText('$73.550');
  await expect(factura).toContainText('Pendiente');

  // Nota de crédito por 10 botellas.
  await page.getByRole('button', { name: 'Nueva compra' }).click();
  d = page.getByRole('dialog', { name: 'Nueva compra' });
  await d.getByLabel('Proveedor', { exact: false }).first().selectOption({ label: 'Envases del Valle Demo SpA' });
  await d.getByRole('combobox', { name: /^Documento( \*)?$/ }).selectOption('nota_credito');
  await d.getByRole('textbox', { name: /^Folio/ }).fill(`${folio}-NC`);
  const ref = d.getByLabel(/Documento que corrige/);
  await ref.selectOption((await ref.locator('option', { hasText: `Factura ${folio} ` }).getAttribute('value'))!);
  await d.getByLabel('Línea 1 · Insumo').selectOption({ label: 'Botella Bordelesa 750 mL (un)' });
  await d.getByLabel('Línea 1 · Cantidad').fill('10');
  await d.getByLabel('Línea 1 · Precio unitario').fill('450');
  expect(await stockBotella(d)).toBe(antes + 100);
  await d.getByRole('button', { name: 'Guardar' }).click();
  await expect(factura).toContainText('$68.195'); // 73.550 − 5.355
  await expect(factura).toContainText('Pago parcial');
  await expect(page.getByRole('row', { name: new RegExp(`Nota de crédito ${folio}-NC`) })).toContainText('−$5.355');

  // Anular: primero la NC, después la factura; el stock vuelve.
  page.on('dialog', (x) => x.accept());
  await page.getByRole('row', { name: new RegExp(`Nota de crédito ${folio}-NC`) }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByRole('row', { name: new RegExp(`Nota de crédito ${folio}-NC`) })).toContainText('Anulada');
  await factura.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click();
  await expect(factura).toContainText('Anulada');
  await page.getByRole('button', { name: 'Nueva compra' }).click();
  d = page.getByRole('dialog', { name: 'Nueva compra' });
  await d.getByLabel('Línea 1 · Insumo').selectOption({ label: 'Botella Bordelesa 750 mL (un)' });
  expect(await stockBotella(d)).toBe(antes);
});

test('pagos: pago parcial en Por pagar baja el saldo; al eliminarlo vuelve', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/proveedores?tab=por-pagar');
  // Demo: factura 1201 de etiquetas por $1.011.500 con un abono de $500.000.
  const fila = page.getByRole('row', { name: /Etiquetas Demo SpA.*Factura 1201/ });
  await expect(fila).toContainText('$511.500');
  await expect(fila).toContainText('Pago parcial');
  await fila.click();
  const d = page.getByRole('dialog', { name: 'Registrar pago' });
  await expect(d.getByLabel('Aplicar a Factura 1201')).toHaveValue('511500');
  await d.getByLabel(/Monto del pago/).fill('200000');
  await expect(d.getByLabel('Aplicar a Factura 1201')).toHaveValue('200000');
  await d.getByLabel(/Referencia/).fill('TRF-E2E');
  await page.screenshot(shots('26-pago'));
  await d.getByRole('button', { name: 'Registrar pago' }).click();
  await expect(fila).toContainText('$311.500');

  await page.getByRole('tab', { name: 'Pagos' }).click();
  await page.getByRole('row', { name: /TRF-E2E/ }).click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(page.getByRole('row', { name: /TRF-E2E/ })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Por pagar' }).click();
  await expect(fila).toContainText('$511.500');
});

test('gastos y presupuesto: factura afecta con IVA a crédito y presupuesto de una categoría sin gastos', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/administracion?tab=gastos&t=2027');
  await page.getByRole('button', { name: 'Nuevo gasto' }).click();
  const d = page.getByRole('dialog', { name: 'Nuevo gasto' });
  await d.getByRole('textbox', { name: /^Descripción/ }).fill('Gasto E2E');
  await d.getByLabel(/^Proveedor/).selectOption({ label: 'Eléctrica Demo S.A.' });
  await d.getByLabel(/Monto neto/).fill('100000');
  await d.getByLabel(/^Pago/).selectOption('pendiente');
  const calc = d.getByRole('complementary', { name: 'Cálculo' });
  await expect(calc).toContainText('$19.000');
  await expect(calc).toContainText('$119.000');
  await d.getByLabel(/^Documento/).selectOption('boleta'); // la boleta no da crédito: sin IVA
  await expect(calc).not.toContainText('$19.000');
  await d.getByLabel(/^Documento/).selectOption('factura');
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Gasto E2E/ });
  await expect(fila).toContainText('Por pagar $119.000');
  await page.screenshot(shots('27-gastos'));
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);

  await page.getByRole('tab', { name: 'Presupuesto' }).click();
  const arriendo = page.getByRole('row', { name: /Arriendo/ });
  await arriendo.getByLabel('Presupuesto Arriendo').fill('3000000');
  await arriendo.getByLabel('Presupuesto Arriendo').press('Enter');
  await expect(page.getByText('Presupuesto de arriendo actualizado.')).toBeVisible();
  await expect(arriendo).toContainText('-100 %'); // sin gastos: proyección 0
  await page.screenshot(shots('28-presupuesto'));
  await arriendo.getByLabel('Presupuesto Arriendo').fill('0');
  await arriendo.getByLabel('Presupuesto Arriendo').press('Enter');
  await expect(page.getByText('Presupuesto de arriendo actualizado.').last()).toBeVisible();
});

test('activos fijos: depreciación anual, fin de vida útil y baja', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/administracion?tab=activos');
  // Demo: la prensa de 2018 con 10 años sigue en uso; la bomba de 2019 con 5 años ya está depreciada.
  await expect(page.getByRole('row', { name: /Bomba de trasiego/ })).toContainText('Depreciado');
  await expect(page.getByRole('row', { name: /Bomba de trasiego/ })).toContainText('$0');
  await page.getByRole('button', { name: 'Nuevo activo' }).click();
  const d = page.getByRole('dialog', { name: 'Nuevo activo' });
  await d.getByRole('textbox', { name: /^Nombre/ }).fill('Activo E2E');
  await d.getByLabel(/Valor neto/).fill('3650000');
  await d.getByLabel(/Vida útil/).fill('10');
  await d.getByLabel(/Fecha de compra/).fill('2026-01-01');
  await expect(d.getByLabel('Cálculo')).toContainText('$365.000');
  await expect(d.getByLabel('Cálculo')).toContainText('31 dic 2035');
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Activo E2E/ });
  await expect(fila).toContainText('En uso');
  await page.screenshot(shots('29-activos'));
  await fila.click();
  await page
    .getByRole('dialog')
    .getByLabel(/Fecha de baja/)
    .fill('2026-02-01');
  await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
  await expect(fila).toContainText('De baja');
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);
});

test('trabajadores: ficha con liquidación estimada en vivo y aviso bajo el ingreso mínimo', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/administracion?tab=trabajadores');
  await expect(page.getByRole('row', { name: /Trabajadora Demo Dos/ })).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo trabajador' }).click();
  const d = page.getByRole('dialog', { name: 'Nuevo trabajador' });
  await d.getByRole('textbox', { name: /^Nombre/ }).fill('Trabajador E2E');
  await d.getByRole('textbox', { name: /^RUT/ }).fill('18.777.888-3');
  await d.getByRole('textbox', { name: /^Cargo/ }).fill('Tractorista');
  await d.getByLabel(/Sueldo base/).fill('400000');
  await expect(d.getByText(/Bajo el ingreso mínimo/)).toBeVisible(); // aviso, no bloquea (v1 bloqueaba)
  await d.getByLabel(/Sueldo base/).fill('900000');
  // Imponible = 900.000 + gratificación art. 50 con tope 4,75 IMM ÷ 12 = 213.354.
  await expect(d.getByRole('complementary', { name: 'Liquidación estimada' })).toContainText('$1.113.354');
  await page.screenshot(shots('30-trabajador'));
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Trabajador E2E/ });
  await expect(fila).toContainText('$900.000');
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);
});

test('remuneraciones: cada mes con sus indicadores, novedades, liquidación imprimible y pago', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  // Octubre (pagada) usa la UTM de octubre del demo; noviembre, la de noviembre.
  await page.goto('/vina-demo/administracion?tab=remuneraciones&periodo=2026-10');
  await page.getByRole('row', { name: /Trabajador Demo Uno/ }).click();
  await page.getByRole('dialog').getByRole('link', { name: 'Ver liquidación' }).click();
  await expect(page.getByLabel('Indicadores usados')).toContainText('UTM $69.900');

  await page.goto('/vina-demo/administracion?tab=remuneraciones&periodo=2026-11');
  await expect(page.getByLabel('Indicadores del mes')).toContainText('UTM $70.200');
  await expect(page.getByRole('row', { name: /Trabajador Demo Tres/ })).toContainText('15'); // ingresó el 16-11
  const fila = page.getByRole('row', { name: /Trabajador Demo Uno/ });
  const liquido = async () => Number((await fila.getByRole('cell').nth(7).innerText()).replace(/\D/g, ''));
  const antes = await liquido();
  await fila.click();
  let d = page.getByRole('dialog');
  await d.getByLabel(/Horas extra/).fill('10');
  await d.getByLabel(/Anticipos/).fill('50000');
  await d.getByRole('button', { name: 'Guardar novedades' }).click();
  await expect.poll(liquido).not.toBe(antes);

  await fila.click();
  await page.getByRole('dialog').getByRole('link', { name: 'Ver liquidación' }).click();
  await expect(page.getByRole('region', { name: 'Haberes' })).toContainText('Horas extra');
  await expect(page.getByRole('region', { name: 'Descuentos' })).toContainText('$50.000');
  await expect(page.getByLabel('Indicadores usados')).toContainText('UTM $70.200');
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('navigation', { name: 'Módulos' })).toBeHidden(); // el shell no se imprime
  await page.screenshot(shots('31-liquidacion-impresa'));
  await page.emulateMedia({ media: 'screen' });

  // Pagar y revertir; deja las novedades como estaban (el demo queda igual).
  await page.goto('/vina-demo/administracion?tab=remuneraciones&periodo=2026-11');
  await fila.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar pagada' }).click();
  await expect(fila).toContainText('Pagada');
  await fila.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revertir pago' }).click();
  await expect(fila).toContainText('Por pagar');
  await fila.click();
  d = page.getByRole('dialog');
  await d.getByLabel(/Horas extra/).fill('0');
  await d.getByLabel(/Anticipos/).fill('0');
  await d.getByRole('button', { name: 'Guardar novedades' }).click();
  await expect.poll(liquido).toBe(antes);
});

test('honorarios: retención a la tasa vigente, pago y reversa', async ({ page }) => {
  await login(page, 'administrativo@winzer.test');
  await page.goto('/vina-demo/administracion?tab=honorarios&t=2027');
  await expect(page.getByRole('row', { name: /Diseñadora Demo/ })).toContainText('Por pagar');
  await page.getByRole('button', { name: 'Nueva boleta' }).click();
  const d = page.getByRole('dialog', { name: 'Nueva boleta de honorarios' });
  await d.getByLabel(/N° de boleta/).fill(String(Date.now() % 100000));
  await d.getByRole('textbox', { name: /^Prestador/ }).fill('Prestador E2E');
  await d.getByRole('textbox', { name: /^RUT/ }).fill('19.111.222-9');
  await d.getByLabel(/Monto bruto/).fill('500000');
  await expect(d.getByLabel('Cálculo')).toContainText('$76.250'); // 15,25 % del demo
  await expect(d.getByLabel('Cálculo')).toContainText('$423.750');
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: /Prestador E2E/ });
  await expect(fila).toContainText('$423.750');
  await fila.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar pagada' }).click();
  await expect(fila).toContainText('Pagada');
  await page.screenshot(shots('32-honorarios'));
  await fila.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Revertir pago' }).click();
  await expect(fila).toContainText('Por pagar');
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);
});

test('marca y etiquetas: marca por renovar y etiqueta con prorrateo del diseño', async ({ page }) => {
  await login(page, 'admin@winzer.test'); // el administrativo crea y edita, pero no borra (marca: vcex)
  await page.goto('/vina-demo/marca');
  const nombre = `Etiqueta E2E ${Date.now().toString(36)}`;
  await expect(page.getByRole('row', { name: /Viña Demo Reserva/ })).toContainText('Renovar'); // vence en marzo de 2027
  await page.getByRole('tab', { name: 'Etiquetas' }).click();
  await page.getByRole('button', { name: 'Nueva versión' }).click();
  const d = page.getByRole('dialog', { name: 'Nueva versión de etiqueta' });
  await d.getByRole('textbox', { name: /^Nombre del diseño/ }).fill(nombre);
  await d.getByLabel(/^Diseño/).fill('100000');
  await d.getByLabel(/Botellas estimadas/).fill('10000');
  await d.getByLabel(/Impresión por etiqueta/).fill('50');
  // 100.000 ÷ máx(0 producidas, 10.000 estimadas) = $10 por botella + $50 de impresión.
  await expect(d.getByLabel('Costo por botella')).toContainText('$60');
  await d.getByRole('button', { name: 'Guardar' }).click();
  const fila = page.getByRole('row', { name: new RegExp(nombre) });
  await expect(fila).toContainText('$60');
  await page.screenshot(shots('33-etiquetas'));
  await fila.click();
  page.once('dialog', (x) => x.accept());
  await page.getByRole('dialog').getByRole('button', { name: 'Eliminar' }).click();
  await expect(fila).toHaveCount(0);
});

test('envasado: orden con costo en vivo; confirmar descuenta botellas y anular las devuelve', async ({ page }) => {
  await login(page, 'enologo@winzer.test');
  await page.goto('/vina-demo/envasado');
  const stockEnvase = async (d: import('@playwright/test').Locator) =>
    Number(((await d.getByRole('list', { name: 'Stock de materiales' }).innerText()).match(/Envase\s+[\d.]+ \/ ([\d.]+)/)?.[1] ?? '0').replace(/\./g, ''));
  const llenar = async (d: import('@playwright/test').Locator) => {
    const est = d.getByLabel(/^Estanque/);
    await est.selectOption((await est.locator('option', { hasText: 'E-01' }).getAttribute('value'))!);
    await d.getByLabel(/^Formato/).selectOption({ label: 'Botella 0,75 L' });
    await d.getByLabel(/^Unidades/).fill('120');
    await d.getByLabel(/^Envase/).selectOption({ index: 1 });
  };
  await page.getByRole('button', { name: 'Nueva orden' }).click();
  let d = page.getByRole('dialog', { name: 'Nueva orden de envasado' });
  await llenar(d);
  await d.getByLabel(/^Mano de obra/).fill('12000');
  const costo = d.getByRole('complementary', { name: 'Costo por botella' });
  await expect(costo).toContainText('Mano de obra');
  await expect(costo).toContainText('$100'); // 12.000 ÷ 120
  const antes = await stockEnvase(d);
  await page.screenshot(shots('34-orden-envasado'));
  page.on('dialog', (x) => x.accept());
  await d.getByRole('button', { name: 'Confirmar' }).click();
  await expect(page.getByText('Orden confirmada: bodega e insumos actualizados.')).toBeVisible();
  const fila = page
    .getByRole('row', { name: /Confirmada/ })
    .filter({ hasText: '120' })
    .first();
  await expect(fila).toContainText('Botella 0,75 L');

  // El stock del envase bajó en 120.
  await page.getByRole('button', { name: 'Nueva orden' }).click();
  d = page.getByRole('dialog', { name: 'Nueva orden de envasado' });
  await llenar(d);
  expect(await stockEnvase(d)).toBe(antes - 120);
  await d.getByRole('button', { name: 'Cancelar' }).click();

  await page.getByRole('tab', { name: 'Validador de etiqueta' }).click();
  await expect(page.getByRole('region', { name: 'Validación de rotulación' })).toContainText('Contenido neto');

  await page.getByRole('tab', { name: 'Órdenes' }).click();
  await fila.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click();
  await expect(page.getByText('Orden anulada.')).toBeVisible();
  await page.getByRole('button', { name: 'Nueva orden' }).click();
  d = page.getByRole('dialog', { name: 'Nueva orden de envasado' });
  await llenar(d);
  expect(await stockEnvase(d)).toBe(antes);
});

test('ventas: venta mixta (envasado + granel) con ILA por línea, folio y anulación; el rol ventas no ve costos', async ({ page }) => {
  await login(page, 'ventas@winzer.test');
  await page.goto('/vina-demo/ventas?t=2027');
  await expect(page.getByRole('columnheader', { name: 'Margen' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Nueva venta' }).click();
  const d = page.getByRole('dialog', { name: 'Nueva venta' });
  await d.getByLabel(/^Cliente/).selectOption({ label: 'Distribuidora Andes SpA' });
  const prod = d.getByLabel('Línea 1 · Producto');
  await prod.selectOption((await prod.locator('option', { hasText: 'Sauvignon Blanc' }).first().getAttribute('value'))!);
  await d.getByLabel('Línea 1 · Cantidad').fill('12');
  await d.getByLabel('Línea 1 · Precio').fill('5000');
  await d.getByRole('button', { name: 'Agregar línea' }).click();
  await d.getByLabel('Línea 2 · Tipo').selectOption('granel');
  const gr = d.getByLabel('Línea 2 · Estanque y lote');
  await gr.selectOption((await gr.locator('option', { hasText: 'E-03' }).first().getAttribute('value'))!);
  await d.getByLabel('Línea 2 · Cantidad').fill('50');
  await d.getByLabel('Línea 2 · Precio').fill('2000');
  const tot = d.getByRole('complementary', { name: 'Totales' });
  // Neto 60.000 + 100.000; ILA 20,5 % solo de la línea envasada; IVA 19 % del neto.
  await expect(tot).toContainText('$160.000');
  await expect(tot).toContainText('$12.300');
  await expect(tot).toContainText('$202.700');
  await expect(d.getByLabel('Margen')).toHaveCount(0);
  await page.screenshot(shots('35-venta'));
  page.on('dialog', (x) => x.accept());
  await d.getByRole('button', { name: 'Confirmar' }).click();
  const fila = page
    .getByRole('row', { name: /Distribuidora Andes SpA/ })
    .filter({ hasText: '2 líneas' })
    .first();
  await expect(fila).toContainText(/Factura N° \d+/);
  await expect(fila).toContainText('Confirmada');
  await fila.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Anular' }).click();
  await expect(fila).toContainText('Anulada');
});
