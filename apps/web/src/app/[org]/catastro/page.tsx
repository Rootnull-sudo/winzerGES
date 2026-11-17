import { NoAccess } from '@/components/no-access';
import { orgWith } from '@/lib/session';
import { CatastroView } from './view';

export const metadata = { title: 'Catastro vitícola' };

/**
 * Módulo OFFLINE: el servidor solo verifica acceso; los datos vienen de IndexedDB
 * (sincronizada por el motor en segundo plano), así la página funciona sin señal en el viñedo.
 */
export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org } = await params;
  const { allowed } = await orgWith(org, 'catastro');
  if (!allowed) return <NoAccess modulo="el catastro" />;
  // El encabezado lo pinta la vista: sus cifras salen de los datos locales (offline).
  return <CatastroView />;
}
