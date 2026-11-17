import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CreateOrgForm } from './form';
import { getMemberships, requireUser } from '@/lib/session';
import { ROLES } from '@winzer/domain';
import { signOutAction } from '../actions';

export const metadata = { title: 'Tus viñas' };

export default async function Onboarding() {
  const u = await requireUser();
  const ms = await getMemberships(u.id);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/winzer-logo.png" alt="Winzer" width={120} height={22} className="logo mb-10 h-auto w-[120px]" />
      <h1 className="font-label text-[32px] leading-tight">
        Hola, {u.name.split(' ')[0]}. {ms.length ? 'Elige una viña' : 'Crea tu viña'}
      </h1>
      {ms.length > 0 && (
        <ul className="mt-6 divide-y divide-rule overflow-hidden border-y border-ink">
          {ms.map((m) => (
            <li key={m.orgId}>
              <Link href={`/${m.slug}`} className="flex items-center justify-between px-4 py-3.5 hover:bg-sunken/60">
                <span>
                  <span className="block font-medium">{m.nombre}</span>
                  <span className="text-[12px] text-ink-3">{ROLES[m.role]?.nombre ?? m.role}</span>
                </span>
                <ArrowRight size={16} className="text-ink-3" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-10">
        {ms.length > 0 && <h2 className="mb-1 font-label text-[20px]">O crea otra viña</h2>}
        <p className="mb-5 text-[14px] text-ink-3">Serás su administrador. Después puedes invitar a tu enólogo, agrónomo o contador, cada uno con su rol.</p>
        <CreateOrgForm />
      </section>
      <form action={signOutAction} className="mt-10">
        <button className="text-[13px] text-ink-3 underline underline-offset-4 hover:text-ink">Cerrar sesión ({u.email})</button>
      </form>
    </main>
  );
}
