/**
 * Correo saliente (ADR 0012, F0-8). Con RESEND_API_KEY se envía por Resend (API HTTP, sin SDK); sin ella, el
 * correo se escribe en la consola del servidor (desarrollo y CI). Un correo que falla nunca rompe la acción que
 * lo originó: quien llama decide qué mostrar.
 */
export interface Correo {
  para: string;
  asunto: string;
  texto: string;
  html: string;
}

export type ResultadoCorreo = { enviado: true; via: 'resend' | 'consola'; id?: string } | { enviado: false; error: string };

const REMITENTE = () => process.env.CORREO_REMITENTE || 'Winzer <no-responder@winzer.local>';

/** Base pública de la app para los enlaces. Nunca se toma de la cabecera Host (se puede falsificar). */
export const urlApp = () => (process.env.BETTER_AUTH_URL || 'http://localhost:3000').replace(/\/$/, '');

export async function enviarCorreo(c: Correo): Promise<ResultadoCorreo> {
  const clave = process.env.RESEND_API_KEY;
  if (!clave) {
    console.log(`[correo] (sin RESEND_API_KEY, no se envía) Para: ${c.para} · Asunto: ${c.asunto}\n${c.texto}\n`);
    return { enviado: true, via: 'consola' };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: REMITENTE(), to: [c.para], subject: c.asunto, text: c.texto, html: c.html })
    });
    if (!r.ok) {
      const error = `Resend respondió ${r.status}`;
      console.error('[correo]', error, await r.text().catch(() => ''));
      return { enviado: false, error };
    }
    const body = (await r.json().catch(() => ({}))) as { id?: string };
    return { enviado: true, via: 'resend', id: body.id };
  } catch (e) {
    console.error('[correo]', e);
    return { enviado: false, error: 'No se pudo conectar con el servicio de correo.' };
  }
}
