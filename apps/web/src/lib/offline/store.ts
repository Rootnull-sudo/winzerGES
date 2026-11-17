'use client';
/**
 * Base local (IndexedDB vía Dexie), una por viña y usuario: los datos de una viña nunca
 * se mezclan con los de otra en el mismo navegador.
 *  - records: última versión conocida de cada registro (+ cambios locales pendientes)
 *  - outbox:  mutaciones por enviar, en orden
 *  - issues:  conflictos/rechazos para mostrar al usuario
 *  - meta:    cursor de sincronización
 */
import Dexie, { type Table } from 'dexie';
import type { Mutation, SyncRecord } from '@winzer/domain';

export interface LocalRecord {
  key: string; // `${entity}:${id}`
  entity: string;
  id: string;
  version: number;
  deleted: boolean;
  data: Record<string, unknown>;
  /** true si hay cambios locales aún no confirmados por el servidor. */
  pending: boolean;
  /** Última versión confirmada por el servidor (para revertir si se rechaza). */
  server: SyncRecord | null;
}
export interface OutboxItem extends Mutation {
  seq?: number;
}
export interface Issue {
  id?: number;
  entity: string;
  recordId: string;
  kind: 'conflict' | 'rejected';
  message: string;
  at: string;
  label: string;
}

export class OrgStore extends Dexie {
  records!: Table<LocalRecord, string>;
  outbox!: Table<OutboxItem, number>;
  issues!: Table<Issue, number>;
  meta!: Table<{ key: string; value: string }, string>;
  constructor(name: string) {
    super(name);
    this.version(1).stores({
      records: 'key, entity, [entity+deleted]',
      outbox: '++seq, entity, id',
      issues: '++id, at',
      meta: 'key'
    });
  }
}

const stores = new Map<string, OrgStore>();
export function orgStore(orgId: string, userId: string) {
  const name = `winzer:${userId}:${orgId}`;
  if (!stores.has(name)) stores.set(name, new OrgStore(name));
  return stores.get(name)!;
}
