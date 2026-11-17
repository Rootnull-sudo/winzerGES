import { IMPORTABLE_ENTITIES } from '@winzer/db';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/ui/page';
import { orgWith } from '@/lib/session';
import { ImportV1 } from './import';

export const metadata = { title: 'Configuración y datos' };

export default async function Page({ params }: { params: Promise<{ org: string }> }) {
  const { org: slug } = await params;
  const { org, allowed, actor } = await orgWith(slug, 'configuracion');
  if (!allowed) return <NoAccess modulo="la configuración" />;
  const { can } = await import('@winzer/domain');
  return (
    <>
      <PageHeader area="Administración" title="Configuración y datos" />
      <section className="mb-10 grid gap-x-8 gap-y-3 border-y border-rule py-5 text-[14px] sm:grid-cols-[180px_1fr]">
        <span className="text-ink-3">Viña</span>
        <span className="font-medium">{org.nombre}</span>
        <span className="text-ink-3">Razón social</span>
        <span>{org.razonSocial ?? '—'}</span>
        <span className="text-ink-3">RUT</span>
        <span className="tabular">{org.rut ?? '—'}</span>
        <span className="text-ink-3">Dirección web</span>
        <span className="font-mono text-[13px]">/{org.slug}</span>
        <span className="text-ink-3">Plan</span>
        <span className="capitalize">{org.plan}</span>
      </section>
      <section id="importar" className="max-w-2xl scroll-mt-20">
        <h2 className="font-label text-[20px]">Importar desde Winzer de escritorio (v1)</h2>
        <p className="mt-1 mb-4 text-[14px] text-ink-2">
          En la versión de escritorio ve a <i>Configuración › Datos y respaldos › Exportar respaldo</i> y sube aquí el archivo .json. Por ahora se importan:{' '}
          <b>{IMPORTABLE_ENTITIES.join(', ')}</b>. Puedes repetirlo cuando quieras: los registros ya importados se actualizan, no se duplican.
        </p>
        {can(actor.role, 'configuracion', 'e', actor.customRoles) ? (
          <ImportV1 slug={slug} />
        ) : (
          <p className="text-[13px] text-ink-3">Solo un administrador puede importar datos.</p>
        )}
      </section>
    </>
  );
}
