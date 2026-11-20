/** Correo (F0-8): transporte, plantillas y resumen diario con Postgres real. Nunca llama a Resend de verdad. */
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { calcularAlertas, type Regla } from '../src/alertas/motor';
import { adminDb } from '../src/client';
import { enviarCorreo } from '../src/correo';
import { enviarResumenes, setResumenAlertas } from '../src/correo/envios';
import { correoInvitacion } from '../src/correo/plantillas';
import { member, organization, user } from '../src/schema';

const run = randomUUID().slice(0, 8);
const A = `test_co_${run}`;
const U1 = `test_c1_${run}`,
  U2 = `test_c2_${run}`;
const regla: Regla = { id: 'test.correo', modulo: 'configuracion', severidad: 'warn', evaluar: async () => [{ titulo: 'Aviso para el resumen' }] };

beforeAll(async () => {
  await adminDb()
    .insert(user)
    .values([
      { id: U1, name: 'Ana Admin', email: `${U1}@test.local` },
      { id: U2, name: 'Agro Nomo', email: `${U2}@test.local` }
    ]);
  await adminDb().insert(organization).values({ id: A, slug: A, nombre: 'Viña Correo' });
  await adminDb()
    .insert(member)
    .values([
      { orgId: A, userId: U1, role: 'admin' },
      { orgId: A, userId: U2, role: 'agronomo' }
    ]);
});
afterAll(async () => {
  await adminDb()
    .delete(organization)
    .where(sql`id = ${A}`);
  await adminDb()
    .delete(user)
    .where(sql`id in (${U1}, ${U2})`);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('correo', () => {
  it('sin RESEND_API_KEY se escribe en la consola y no sale a la red', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const red = vi.fn();
    vi.stubGlobal('fetch', red);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await enviarCorreo({ para: 'a@test.local', asunto: 'Hola', texto: 't', html: 'h' })).toEqual({ enviado: true, via: 'consola' });
    expect(red).not.toHaveBeenCalled();
    expect(log.mock.calls[0]![0]).toContain('Asunto: Hola');
  });

  it('con RESEND_API_KEY llama a la API y un error no lanza', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = vi.fn(async () => new Response(JSON.stringify({ id: 'm1' }), { status: 200 }));
    vi.stubGlobal('fetch', ok);
    expect(await enviarCorreo({ para: 'a@test.local', asunto: 'Hola', texto: 't', html: 'h' })).toEqual({ enviado: true, via: 'resend', id: 'm1' });
    const [url, init] = ok.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 500 }))
    );
    expect(await enviarCorreo({ para: 'a@test.local', asunto: 'Hola', texto: 't', html: 'h' })).toMatchObject({ enviado: false });
  });

  it('las plantillas escapan HTML', () => {
    const c = correoInvitacion({ para: 'x', vina: '<script>', rol: 'Admin', invitadoPor: 'Ana & Co', enlace: 'http://x/y', diasVigencia: 7 });
    expect(c.html).toContain('&lt;script&gt;');
    expect(c.html).toContain('Ana &amp; Co');
    expect(c.html).not.toContain('<script>');
  });

  it('el resumen diario va solo a quien lo activó y solo con avisos que puede ver', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await calcularAlertas(A, [regla]);
    const desde = new Date(Date.now() - 3_600_000);
    expect(await enviarResumenes(desde)).toMatchObject({ enviados: 0 });

    await setResumenAlertas({ orgId: A, userId: U1, userName: 'Ana', role: 'admin' }, true);
    await setResumenAlertas({ orgId: A, userId: U2, userName: 'Agro', role: 'agronomo' }, true);
    const r = await enviarResumenes(desde);
    // El agrónomo no ve configuración: no recibe nada. Puede haber otras viñas de prueba en la base.
    const mios = log.mock.calls.map((c) => String(c[0])).filter((t) => t.includes('Viña Correo'));
    expect(mios).toHaveLength(1);
    expect(mios[0]).toContain(`${U1}@test.local`);
    expect(mios[0]).toContain('Aviso para el resumen');
    expect(r.enviados).toBeGreaterThanOrEqual(1);
  });
});
