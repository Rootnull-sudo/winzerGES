'use client';
import { ArrowDown, ArrowUp, Download, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface Column<T> {
  key: string;
  label: string;
  num?: boolean;
  /** Valor para ordenar, buscar y exportar. Por defecto row[key]. */
  value?: (r: T) => string | number | null | undefined;
  render?: (r: T) => ReactNode;
  className?: string;
}

/**
 * Tabla densa (filas 40px, números tabulares a la derecha) con búsqueda, orden por columna
 * y exportación CSV (separador ; y BOM para que Excel en español la abra bien, igual que v1).
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  onRowClick,
  exportName,
  canExport,
  toolbar,
  empty,
  rowClassName
}: {
  rows: T[];
  columns: Column<T>[];
  onRowClick?: (r: T) => void;
  exportName?: string;
  canExport?: boolean;
  toolbar?: ReactNode;
  empty?: ReactNode;
  rowClassName?: (r: T) => string | undefined;
}) {
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const val = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key]) as string | number | null | undefined;

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    let out = needle
      ? rows.filter((r) =>
          columns.some((c) =>
            String(val(c, r) ?? '')
              .toLowerCase()
              .normalize('NFD')
              .replace(/[̀-ͯ]/g, '')
              .includes(needle)
          )
        )
      : rows;
    if (sort) {
      const c = columns.find((x) => x.key === sort.key)!;
      out = [...out].sort((a, b) => {
        const x = val(c, a),
          y = val(c, b);
        if (x == null || x === '') return 1;
        if (y == null || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'es')) * sort.dir;
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, sort, columns]);

  function exportCsv() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [columns.map((c) => esc(c.label)).join(';'), ...shown.map((r) => columns.map((c) => esc(val(c, r))).join(';'))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `${exportName ?? 'export'}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 sm:max-w-xs">
          <span className="sr-only">Buscar</span>
          <Search size={15} className="pointer-events-none absolute top-1/2 left-0.5 -translate-y-1/2 text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar…"
            className="h-10 w-full border-0 border-b border-rule-strong bg-transparent pr-3 pl-7 text-[14px] placeholder:text-ink-3 hover:border-ink-3 focus:border-ink focus:outline-none"
          />
        </label>
        <span className="tabular text-[12px] text-ink-3">
          {shown.length === rows.length ? `${rows.length} ${rows.length === 1 ? 'registro' : 'registros'}` : `${shown.length} de ${rows.length}`}
        </span>
        <div className="ml-auto flex gap-2">
          {toolbar}
          {canExport && rows.length > 0 && (
            <button
              onClick={exportCsv}
              className="inline-flex h-10 items-center gap-1.5 px-2.5 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink"
            >
              <Download size={15} /> CSV
            </button>
          )}
        </div>
      </div>
      {rows.length === 0 && empty ? (
        empty
      ) : (
        <div className="overflow-x-auto border-t border-ink">
          <table className="w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-rule">
                {columns.map((c, i) => {
                  const active = sort?.key === c.key;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort!.dir === 1 ? 'ascending' : 'descending') : undefined}
                      className={cn(
                        'h-10 px-3 text-[12px] font-medium tracking-[0.06em] whitespace-nowrap text-ink-3 uppercase first:pl-0',
                        c.num ? 'text-right' : 'text-left',
                        i === 0 && 'sticky left-0 bg-paper'
                      )}
                    >
                      <button
                        onClick={() => setSort(active ? (sort!.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })}
                        className={cn('inline-flex items-center gap-1 hover:text-ink', active && 'text-ink')}
                      >
                        {c.label}
                        {active && (sort!.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr
                  key={r.id}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  className={cn('group border-b border-rule last:border-0', onRowClick && 'cursor-pointer hover:bg-sunken', rowClassName?.(r))}
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={cn(
                        'h-12 px-3 whitespace-nowrap first:pl-0',
                        c.num && 'tabular text-right',
                        i === 0 && 'sticky left-0 bg-paper group-hover:bg-sunken',
                        c.className
                      )}
                    >
                      {c.render ? c.render(r) : String(val(c, r) ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-10 text-center text-[13px] text-ink-3">
                    Nada coincide con “{q}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
