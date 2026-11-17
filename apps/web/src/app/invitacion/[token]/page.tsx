import Link from 'next/link';
import { findInvitation } from '@winzer/db';
import { ROLES } from '@winzer/domain';
import { getSession } from '@/lib/session';
import { AcceptButton } from './accept';

export const metadata = { title: 'Invitación' };

export default async function Invitacion({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await findInvitation(token);
  const s = await getSession();
  const next = encodeURIComponent(`/invitacion/${token}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      {!inv ? (
        <>
          <h1 className="font-label text-[28px]">Invitación no válida</h1>
          <p className="mt-2 text-ink-3">Ya se usó o expiró. Pide al administrador de la viña que te envíe una nueva.</p>
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/winzer-logo.png" alt="Winzer" width={120} height={22} className="logo mb-10 h-auto w-[120px]" />
          <h1 className="font-label text-[32px] leading-tight">Únete a {inv.org.nombre}</h1>
          <p className="mt-2 text-ink-2">
            Con el rol <b>{ROLES[inv.inv.role]?.nombre ?? inv.inv.role}</b>, para <b>{inv.inv.email}</b>.
          </p>
          <div className="mt-8">
            {s ? (
              <AcceptButton token={token} />
            ) : (
              <div className="flex gap-2">
                <Link
                  href={`/registro?next=${next}`}
                  className="inline-flex h-9 items-center rounded-control bg-ink px-3.5 text-[14px] font-medium text-on-ink"
                >
                  Crear cuenta
                </Link>
                <Link
                  href={`/login?next=${next}`}
                  className="inline-flex h-9 items-center rounded-control border border-rule-strong px-3.5 text-[14px] font-medium"
                >
                  Ya tengo cuenta
                </Link>
              </div>
            )}
          </div>
        </>
      )}
    </main>
  );
}
