/** Plantillas de correo: texto plano + HTML sencillo (sin imágenes externas), en español de Chile. */
import type { Correo } from './index';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function marco(titulo: string, cuerpo: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#f5f5f3;font-family:Arial,Helvetica,sans-serif;color:#1b1b1b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e4e4e0;border-radius:8px">
<tr><td style="padding:24px 28px 8px;font-family:Georgia,serif;font-size:22px;letter-spacing:2px">WINZER</td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.55"><h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 12px">${esc(titulo)}</h1>${cuerpo}</td></tr>
</table></td></tr></table></body></html>`;
}

const boton = (url: string, texto: string) =>
  `<p style="margin:24px 0"><a href="${esc(url)}" style="background:#1b1b1b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:bold;display:inline-block">${esc(texto)}</a></p>`;

export function correoInvitacion(d: { para: string; vina: string; rol: string; invitadoPor: string; enlace: string; diasVigencia: number }): Correo {
  const asunto = `${d.invitadoPor} te invitó a ${d.vina} en Winzer`;
  const texto = `${d.invitadoPor} te invitó a trabajar en ${d.vina} con el rol ${d.rol}.

Acepta la invitación aquí (vence en ${d.diasVigencia} días):
${d.enlace}

Si no esperabas este correo, ignóralo.`;
  const html = marco(
    `Te invitaron a ${d.vina}`,
    `<p style="margin:0">${esc(d.invitadoPor)} te invitó a trabajar en <b>${esc(d.vina)}</b> con el rol <b>${esc(d.rol)}</b>.</p>
${boton(d.enlace, 'Aceptar invitación')}
<p style="margin:0;color:#6b6b66;font-size:13px">El enlace vence en ${d.diasVigencia} días. Si no esperabas este correo, ignóralo.</p>`
  );
  return { para: d.para, asunto, texto, html };
}

export function correoResumenAlertas(d: {
  para: string;
  nombre: string;
  vina: string;
  enlace: string;
  alertas: { titulo: string; mensaje: string | null }[];
}): Correo {
  const n = d.alertas.length;
  const asunto = `${d.vina}: ${n} ${n === 1 ? 'aviso nuevo' : 'avisos nuevos'}`;
  const texto = `Hola ${d.nombre}, estos son los avisos nuevos de ${d.vina} en las últimas 24 horas:

${d.alertas.map((a) => `• ${a.titulo}${a.mensaje ? ` — ${a.mensaje}` : ''}`).join('\n')}

Revísalos en ${d.enlace}
Puedes dejar de recibir este resumen desde la campana de avisos.`;
  const html = marco(
    asunto,
    `<p style="margin:0 0 12px">Hola ${esc(d.nombre)}, estos son los avisos nuevos de las últimas 24 horas:</p>
<ul style="padding-left:18px;margin:0">${d.alertas
      .map((a) => `<li style="margin:0 0 8px"><b>${esc(a.titulo)}</b>${a.mensaje ? `<br><span style="color:#4a4a46">${esc(a.mensaje)}</span>` : ''}</li>`)
      .join('')}</ul>
${boton(d.enlace, 'Abrir Winzer')}
<p style="margin:0;color:#6b6b66;font-size:13px">Puedes dejar de recibir este resumen desde la campana de avisos.</p>`
  );
  return { para: d.para, asunto, texto, html };
}
