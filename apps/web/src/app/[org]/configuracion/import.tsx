'use client';
import { Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSync } from '@/lib/offline/hooks';

interface Report {
  importados: Record<string, number>;
  omitidos: { entidad: string; id: string; motivo: string }[];
  pendientes: Record<string, number>;
}

export function ImportV1({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const engine = useSync();
  const router = useRouter();

  async function onFile(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/api/${slug}/import-v1`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: await f.text() });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'No se pudo importar.');
      setReport(body);
      void engine?.sync();
      router.refresh();
    } catch (e) {
      setError(e instanceof SyntaxError ? 'El archivo no es un JSON válido.' : (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border border-dashed border-rule-strong px-6 py-10 text-center hover:bg-sunken/50">
        <Upload size={22} className="text-ink-3" />
        <span className="font-medium">{busy ? 'Importando…' : 'Elegir archivo de respaldo (.json)'}</span>
        <span className="text-[12px] text-ink-3">Se procesa en el servidor de Winzer; el archivo no se guarda.</span>
        <input type="file" accept="application/json,.json" className="sr-only" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-control bg-bad-soft px-3 py-2 text-[13px] text-bad">
          {error}
        </p>
      )}
      {report && (
        <div className="mt-4 rounded-card border border-rule bg-raised p-4 text-[14px]" role="status">
          <p className="font-medium">Importación terminada</p>
          <ul className="mt-2 tabular">
            {Object.entries(report.importados).map(([e, n]) => (
              <li key={e}>
                ✓ {n} {e}
              </li>
            ))}
          </ul>
          {report.omitidos.length > 0 && (
            <details className="mt-3 text-[13px] text-warn">
              <summary className="cursor-pointer">{report.omitidos.length} registros omitidos por datos inválidos</summary>
              <ul className="mt-1 list-disc pl-5">
                {report.omitidos.slice(0, 50).map((o) => (
                  <li key={o.entidad + o.id}>
                    {o.entidad} {o.id}: {o.motivo}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {Object.keys(report.pendientes).length > 0 && (
            <p className="mt-3 text-[13px] text-ink-3">
              Quedan en v1 hasta que se migren sus módulos:{' '}
              {Object.entries(report.pendientes)
                .map(([e, n]) => `${e} (${n})`)
                .join(', ')}
              .
            </p>
          )}
          <Button className="mt-3" size="sm" onClick={() => setReport(null)}>
            Cerrar
          </Button>
        </div>
      )}
    </div>
  );
}
