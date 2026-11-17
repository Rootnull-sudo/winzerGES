import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect('/');
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(0,560px)]">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-ink p-10 text-on-ink lg:flex">
        <p className="font-label text-[22px] font-semibold tracking-[-0.01em]">Winzer</p>
        <div>
          <p className="font-label text-[44px] leading-[1.05] font-semibold tracking-[-0.025em] text-balance">
            De la parra a la botella, y de la venta al F29.
          </p>
          <p className="mt-4 max-w-md text-[15px] text-on-ink/70">
            Catastro, vendimia, bodega, ventas y tributario de tu viña, en un solo lugar. En el campo, también sin señal.
          </p>
        </div>
        <p className="text-[12px] tracking-[0.08em] text-on-ink/50 uppercase">Hecho para viñas boutique chilenas</p>
      </section>
      <section className="flex items-center justify-center px-4 py-10 sm:px-10">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
