'use client';
import { AREAS, MODULES } from '@winzer/domain';
import { moduleHref } from '@/lib/routes';
import { ChevronsUpDown, CloudOff, LogOut, Menu, Moon, Search, Sun, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { SyncEngine } from '@/lib/offline/engine';
import { SyncContext, useIssues, useSync, useSyncState } from '@/lib/offline/hooks';
import { signOutAction } from '@/app/actions';
import { CommandPalette } from './command-palette';
import { OrgContext, useCan, useOrg, type OrgCtx } from './org-context';

export function AppShell({ ctx, memberships, children }: { ctx: OrgCtx; memberships: { slug: string; nombre: string }[]; children: React.ReactNode }) {
  // El motor offline solo existe en el navegador: se crea tras montar (sin desajuste de hidratación).
  const [engine, setEngine] = useState<SyncEngine | null>(null);
  useEffect(() => {
    const e = new SyncEngine(ctx.org.slug, ctx.org.id, ctx.user.id);
    setEngine(e);
    return e.start();
  }, [ctx.org.slug, ctx.org.id, ctx.user.id]);
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);
  const [navOpen, setNavOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setNavOpen(false), [pathname]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, []);

  return (
    <OrgContext.Provider value={ctx}>
      <SyncContext.Provider value={engine}>
        <div className="min-h-dvh lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
          {/* Sidebar: mismo fondo que el lienzo, separada solo por un borde */}
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-rule bg-paper transition-transform duration-200 ease-out-quick lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0',
              navOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <Link href={`/${ctx.org.slug}`} className="block px-6 pt-7 pb-6" aria-label="Winzer, inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/winzer-logo.png" alt="Winzer" width={128} height={23} className="logo h-auto w-[128px]" />
            </Link>
            <OrgSwitcher memberships={memberships} />
            <Nav />
            <UserFooter />
          </aside>
          {navOpen && <button aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setNavOpen(false)} />}
          <div className="min-w-0">
            <header className="sticky top-0 z-20 flex h-16 items-center gap-3 bg-paper px-4 sm:px-8 lg:px-12">
              <button
                className="-ml-2 grid size-11 place-items-center text-ink-2 hover:bg-sunken lg:hidden"
                aria-label="Abrir menú"
                onClick={() => setNavOpen(true)}
              >
                <Menu size={20} />
              </button>
              <button
                onClick={() => setCmdOpen(true)}
                className="flex h-10 min-w-0 flex-1 items-center gap-2.5 border-b border-rule-strong text-[14px] text-ink-3 hover:border-ink sm:max-w-sm"
              >
                <Search size={16} /> <span className="truncate">Buscar o ir a…</span>
                <kbd className="ml-auto hidden border border-rule-strong px-1.5 font-sans text-[11px] text-ink-3 sm:inline">Ctrl K</kbd>
              </button>
              <div className="ml-auto flex items-center gap-1">
                <SyncPill />
              </div>
            </header>
            <IssuesBanner />
            <main className="mx-auto max-w-[1360px] px-4 pt-4 pb-12 sm:px-8 lg:px-12">{children}</main>
          </div>
        </div>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      </SyncContext.Provider>
    </OrgContext.Provider>
  );
}

function OrgSwitcher({ memberships }: { memberships: { slug: string; nombre: string }[] }) {
  const { org, roleName } = useOrg();
  const others = memberships.filter((m) => m.slug !== org.slug);
  return (
    <details className="group relative mx-6 border-y border-t-ink border-b-rule">
      <summary className="flex h-14 cursor-pointer list-none items-center gap-3 hover:bg-sunken [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] leading-tight font-semibold">{org.nombre}</span>
          <span className="block truncate text-[12px] text-ink-3">{roleName}</span>
        </span>
        <ChevronsUpDown size={15} className="text-ink-3" />
      </summary>
      <div className="absolute inset-x-0 top-[calc(100%+4px)] z-50 border border-ink bg-raised p-1">
        {others.map((m) => (
          <a key={m.slug} href={`/${m.slug}`} className="block truncate px-3 py-2.5 text-[14px] hover:bg-sunken">
            {m.nombre}
          </a>
        ))}
        <Link href="/onboarding" className="block px-3 py-2.5 text-[13px] text-ink-3 hover:bg-sunken hover:text-ink">
          + Crear o elegir otra viña
        </Link>
      </div>
    </details>
  );
}

function Nav() {
  const { org } = useOrg();
  const can = useCan();
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-6 py-6" aria-label="Módulos">
      {AREAS.map((a) => {
        const mods = MODULES.filter((m) => m.area === a.id && can(m.id));
        if (!mods.length) return null;
        return (
          <div key={a.id} className="mb-6">
            <p className="mb-1.5 flex items-center gap-2 font-label text-[13px] tracking-[0.12em] text-ink-3 uppercase">
              {a.name}
              {a.offline && (
                <span title="Funciona sin conexión" className="size-1.5 rounded-full border border-ink-3">
                  <span className="sr-only">(funciona sin conexión)</span>
                </span>
              )}
            </p>
            {mods.map((m) => {
              const href = moduleHref(org.slug, m);
              const active = m.id === 'dashboard' ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  key={m.id}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 text-[14px] transition-colors duration-100',
                    active ? 'font-semibold text-ink' : 'pl-6 text-ink-2 hover:text-ink',
                    m.status !== 'v2' && m.id !== 'dashboard' && 'text-ink-3'
                  )}
                >
                  {active && <span aria-hidden className="w-3.5 shrink-0 border-t border-ink" />}
                  <span className="truncate">{m.name}</span>
                  {m.status !== 'v2' && m.id !== 'dashboard' && <span className="ml-auto text-[10px] font-medium tracking-wide text-ink-4 uppercase">v1</span>}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function UserFooter() {
  const { user } = useOrg();
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem('winzer:theme');
    } catch {}
    const d = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    setDark(d);
    if (t) document.documentElement.dataset.theme = t;
  }, []);
  function toggle() {
    const next = dark ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('winzer:theme', next);
    } catch {}
    setDark(!dark);
  }
  return (
    <div className="mx-6 flex items-center gap-1 border-t border-rule py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{user.name}</span>
        <span className="block truncate text-[12px] text-ink-3">{user.email}</span>
      </span>
      <button
        onClick={toggle}
        aria-label={dark ? 'Modo claro' : 'Modo oscuro'}
        className="grid size-10 place-items-center text-ink-3 hover:bg-sunken hover:text-ink"
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <form action={signOutAction}>
        <button aria-label="Cerrar sesión" className="grid size-10 place-items-center text-ink-3 hover:bg-sunken hover:text-ink">
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}

/** Estado de sincronización: siempre visible, porque en el campo la señal va y viene. */
function SyncPill() {
  const s = useSyncState();
  const e = useSync();
  if (!s || !e) return null;
  const label = !s.online ? 'Sin conexión' : s.syncing || !s.ready ? 'Sincronizando…' : s.pending ? `${s.pending} por enviar` : 'Al día';
  return (
    <button
      onClick={() => void e.sync()}
      title={s.lastSync ? `Última sincronización: ${new Date(s.lastSync).toLocaleString('es-CL')}` : 'Aún no se sincroniza'}
      className={cn('inline-flex h-10 items-center gap-2 px-2 text-[13px] hover:bg-sunken', !s.online ? 'font-semibold text-warn' : 'text-ink-2')}
    >
      {/* Mismo lenguaje que el sello: línea continua = al día, de trazos = pendiente o en curso. */}
      {!s.online ? (
        <CloudOff size={15} />
      ) : (
        <span
          aria-hidden
          className={cn('w-[18px] border-t-2 border-ink', (s.pending > 0 || s.syncing || !s.ready) && 'border-dashed', s.syncing && 'animate-pulse')}
        />
      )}
      <span className="hidden sm:inline">{label}</span>
      {s.error && <span className="sr-only">{s.error}</span>}
    </button>
  );
}

function IssuesBanner() {
  const issues = useIssues();
  const e = useSync();
  const s = useSyncState();
  if (!issues.length && !s?.error) return null;
  return (
    <div className="border-b border-warn/20 bg-warn-soft px-4 py-2.5 text-[13px] text-warn sm:px-6">
      {s?.error && <p className="font-medium">{s.error}</p>}
      {issues.slice(0, 3).map((i) => (
        <p key={i.id} className="flex items-start gap-2">
          <span className="flex-1">
            <b>{i.kind === 'conflict' ? 'Conflicto' : 'No se guardó'}</b> · {i.label}: {i.message}
          </span>
          <button onClick={() => void e?.dismissIssue(i.id!)} aria-label="Descartar aviso" className="shrink-0 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </p>
      ))}
    </div>
  );
}
