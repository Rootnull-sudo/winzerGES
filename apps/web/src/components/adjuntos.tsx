'use client';
import { ADJUNTABLES, MAX_BYTES_ADJUNTO, MIME_PERMITIDOS } from '@winzer/domain';
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { confirmarAdjunto, descargarAdjunto, eliminarAdjuntoDe, listarAdjuntosDe, prepararAdjunto } from '@/app/[org]/adjuntos-actions';
import { useCan, useOrg } from './shell/org-context';
import { Button } from './ui/button';
import { useToast } from './ui/toast';

interface Fila {
  id: string;
  nombre: string;
  mime: string;
  bytes: number;
  createdAt: Date | string;
}

const tamano = (b: number) =>
  b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toLocaleString('es-CL', { maximumFractionDigits: 1 })} MB`;
const fecha = (d: Date | string) => new Date(d).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Archivos adjuntos de un registro (ADR 0013). Sube directo al almacenamiento con una URL firmada; requiere
 * conexión. Permisos del módulo dueño: ver y descargar `v`, subir `e`, quitar `d`.
 */
export function Adjuntos({ entidad, registroId }: { entidad: string; registroId: string }) {
  const { org } = useOrg();
  const can = useCan();
  const toast = useToast();
  const modulo = ADJUNTABLES[entidad]!;
  const editable = can(modulo, 'e');
  const borrable = can(modulo, 'd');
  const input = useRef<HTMLInputElement>(null);
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const r = await listarAdjuntosDe(org.slug, entidad, registroId);
    if (r.ok) setFilas(r.adjuntos);
    else setError(r.error);
  }, [org.slug, entidad, registroId]);
  useEffect(() => void cargar(), [cargar]);

  async function subir(files: FileList | null) {
    setError(null);
    for (const f of Array.from(files ?? [])) {
      setSubiendo(f.name);
      const mime = f.type || 'application/octet-stream';
      const p = await prepararAdjunto(org.slug, { entidad, registroId, nombre: f.name, mime, bytes: f.size });
      if (!p.ok) {
        setError(`${f.name}: ${p.error}`);
        continue;
      }
      const put = await fetch(p.url, { method: 'PUT', body: f, headers: { 'Content-Type': mime } }).catch(() => null);
      if (!put?.ok) {
        setError(`${f.name}: no se pudo subir. Revisa tu conexión.`);
        continue;
      }
      const c = await confirmarAdjunto(org.slug, { id: p.id, clave: p.clave, entidad, registroId, nombre: f.name });
      if (!c.ok) setError(`${f.name}: ${c.error}`);
      else toast(`${f.name} adjuntado.`);
    }
    setSubiendo(null);
    if (input.current) input.current.value = '';
    await cargar();
  }

  async function descargar(id: string) {
    const r = await descargarAdjunto(org.slug, id);
    if (r.ok) window.location.assign(r.url);
    else setError(r.error);
  }

  async function quitar(f: Fila) {
    if (!confirm(`¿Quitar ${f.nombre}?`)) return;
    const r = await eliminarAdjuntoDe(org.slug, f.id);
    if (r.ok) {
      toast('Adjunto quitado.');
      await cargar();
    } else setError(r.error);
  }

  return (
    <section aria-label="Adjuntos" className="mt-6">
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">Adjuntos</h3>
        {editable && (
          <>
            <input
              ref={input}
              type="file"
              multiple
              className="sr-only"
              id={`adjuntar-${registroId}`}
              accept={MIME_PERMITIDOS.join(',')}
              onChange={(e) => void subir(e.target.files)}
            />
            <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={!!subiendo} onClick={() => input.current?.click()}>
              <Paperclip size={14} aria-hidden /> {subiendo ? `Subiendo ${subiendo}…` : 'Adjuntar archivo'}
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="mb-2 rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {filas === null ? (
        <div className="h-12 animate-pulse rounded-card bg-sunken" />
      ) : filas.length === 0 ? (
        <p className="rounded-card border border-dashed border-rule-strong px-4 py-3 text-[13px] text-ink-3">
          Sin archivos. PDF, imágenes, planillas o XML de hasta {MAX_BYTES_ADJUNTO / 1024 / 1024} MB.
        </p>
      ) : (
        <ul className="divide-y divide-rule rounded-card border border-rule">
          {filas.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-[14px]">
              <FileText size={16} className="shrink-0 text-ink-3" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{f.nombre}</span>
                <span className="block text-[12px] text-ink-3 tabular">
                  {tamano(f.bytes)} · {fecha(f.createdAt)}
                </span>
              </span>
              <Button type="button" size="sm" variant="ghost" aria-label={`Descargar ${f.nombre}`} onClick={() => void descargar(f.id)}>
                <Download size={14} aria-hidden />
              </Button>
              {borrable && (
                <Button type="button" size="sm" variant="ghost" aria-label={`Quitar ${f.nombre}`} onClick={() => void quitar(f)}>
                  <Trash2 size={14} aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
