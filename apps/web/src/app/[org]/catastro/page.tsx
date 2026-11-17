import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
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
  return (
    <>
      <PageHeader
        area="Operación · funciona sin conexión"
        title="Catastro vitícola"
        description="Cuarteles del viñedo: variedad, superficie, plantación y estado sanitario. Los cambios hechos sin señal se envían solos al recuperar la conexión."
      />
      <CatastroView />
    </>
  );
}
