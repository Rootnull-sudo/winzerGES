'use client';
import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useState } from 'react';
import type { SyncEngine, SyncState } from './engine';

export const SyncContext = createContext<SyncEngine | null>(null);

/** Motor de sync de la viña activa. null durante el render en servidor y el primer render en cliente. */
export function useSync() {
  return useContext(SyncContext);
}

export function useSyncState(): SyncState | null {
  const e = useContext(SyncContext);
  const [s, setS] = useState<SyncState | null>(e?.state ?? null);
  useEffect(() => (e ? e.subscribe(setS) : undefined) as (() => void) | undefined, [e]);
  return s;
}

/** Registros vivos de una entidad (se actualiza solo al cambiar IndexedDB). undefined = cargando. */
export function useEntity<T = Record<string, unknown>>(entity: string) {
  const e = useSync();
  return useLiveQuery(
    async () =>
      !e
        ? undefined
        : (
            await e.db.records
              .where('entity')
              .equals(entity)
              .filter((r) => !r.deleted)
              .toArray()
          ).map((r) => ({ ...(r.data as T), id: r.id, _pending: r.pending, _version: r.version })),
    [e, entity]
  );
}

export function useIssues() {
  const e = useSync();
  return useLiveQuery(async () => (e ? e.db.issues.orderBy('at').reverse().toArray() : []), [e]) ?? [];
}
