import type { ModuleDef } from '@winzer/domain';

/** Ruta de un módulo: migrados en /<viña>/<módulo>, pendientes en /<viña>/m/<módulo>. */
export const moduleHref = (slug: string, m: ModuleDef) => (m.id === 'dashboard' ? `/${slug}` : m.status === 'v2' ? `/${slug}/${m.id}` : `/${slug}/m/${m.id}`);
