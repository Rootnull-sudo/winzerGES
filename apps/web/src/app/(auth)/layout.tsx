import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect('/');
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-on-ink lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/winzer-logo.png" alt="Winzer" width={150} height={27} className="logo-on-ink h-auto w-[150px]" />
        <div>
          <p className="font-label text-[44px] leading-[1.05] text-balance">De la parra a la botella, y de la venta al F29.</p>
          <p className="mt-4 max-w-md text-[15px] text-on-ink/70">
            Catastro, vendimia, bodega, ventas y tributario de tu viña, en un solo lugar. En el campo, también sin señal.
          </p>
        </div>
        <p className="text-[13px] text-on-ink/60">Hecho para viñas boutique chilenas</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
