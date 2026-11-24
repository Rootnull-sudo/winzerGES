'use client';
import { AREAS, can as canRole, enPlan, MODULES, planQueIncluye } from '@winzer/domain';
import { moduleHref } from '@/lib/routes';
import { CalendarRange, Check, ChevronDown, ChevronsUpDown, CloudOff, Lock, LogOut, Menu, Moon, RefreshCw, Search, Sun, WifiOff, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { SyncEngine } from '@/lib/offline/engine';
import { SyncContext, useIssues, useSync, useSyncState } from '@/lib/offline/hooks';
import { signOutAction } from '@/app/actions';
import { Campana } from './campana';
import { CommandPalette } from './command-palette';
import { ICONS } from './icons';
import { OrgContext, useOrg, type OrgCtx } from './org-context';

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
        <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--side)_248px,transparent_248px)] print:block print:bg-none">
          {/* Menú lateral negro (como v1): logo, viña activa, módulos por área y usuario. */}
          <aside
            className={cn(
              'fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col bg-side text-side-ink transition-transform duration-200 ease-out-quick lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 print:hidden',
              navOpen ? 'translate-x-0' : '-translate-x-full'
            )}
          >
            <OrgSwitcher memberships={memberships} />
            <Nav />
            <UserFooter />
          </aside>
          {navOpen && <button aria-label="Cerrar menú" className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setNavOpen(false)} />}
          <div className="min-w-0">
            <header className="sticky top-0 z-20 flex h-15 items-center gap-3 border-b border-rule bg-raised px-4 sm:px-8 print:hidden">
              <button
                className="-ml-2 grid size-11 place-items-center rounded-control text-ink-2 hover:bg-sunken lg:hidden"
                aria-label="Abrir menú"
                onClick={() => setNavOpen(true)}
              >
                <Menu size={20} />
              </button>
              <button
                onClick={() => setCmdOpen(true)}
                className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-control border border-rule-strong px-3 text-[14px] text-ink-3 hover:border-ink-4 sm:max-w-md"
              >
                <Search size={16} /> <span className="truncate">Buscar módulos, cuarteles, clientes…</span>
                <kbd className="ml-auto hidden rounded border border-rule px-1.5 font-sans text-[11px] text-ink-3 sm:inline">Ctrl K</kbd>
              </button>
              <div className="ml-auto flex items-center gap-2">
                <TemporadaSelect />
                <Campana />
                <SyncPill />
                <UserChip />
              </div>
            </header>
            <PlanBanner />
            <IssuesBanner />
            <main className="mx-auto max-w-[1360px] px-4 py-6 sm:px-8">{children}</main>
          </div>
        </div>
        <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      </SyncContext.Provider>
    </OrgContext.Provider>
  );
}

/** Logo + viña activa; al abrirlo se cambia de viña. */
function OrgSwitcher({ memberships }: { memberships: { slug: string; nombre: string }[] }) {
  const { org } = useOrg();
  const others = memberships.filter((m) => m.slug !== org.slug);
  return (
    <details className="group relative border-b border-side-rule">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 pt-5 pb-4 hover:bg-side-raised/50 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/winzer-logo.png" alt="Winzer" width={116} height={21} className="h-auto w-[116px] invert" />
          <span className="mt-2 block truncate text-[13px] text-side-ink-2">{org.nombre}</span>
        </span>
        <ChevronsUpDown size={15} className="text-side-ink-3" />
      </summary>
      <div className="absolute inset-x-3 top-[calc(100%+4px)] z-50 rounded-card border border-rule-strong bg-raised p-1 text-ink">
        {others.map((m) => (
          <a key={m.slug} href={`/${m.slug}`} className="block truncate rounded-control px-3 py-2.5 text-[14px] hover:bg-sunken">
            {m.nombre}
          </a>
        ))}
        <Link href="/onboarding" className="block rounded-control px-3 py-2.5 text-[13px] text-ink-3 hover:bg-sunken hover:text-ink">
          + Crear o elegir otra viña
        </Link>
      </div>
    </details>
  );
}

function Nav() {
  const { org, role, customRoles, acceso } = useOrg();
  // Se listan los módulos que el ROL puede ver; los que el plan no incluye aparecen con candado ("disponible en …").
  const can = (id: string) => canRole(role, id, 'v', customRoles);
  const pathname = usePathname();
  // La temporada elegida viaja entre módulos (ADR 0011).
  const t = useSearchParams().get('t');
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Módulos">
      {AREAS.map((a) => {
        const mods = MODULES.filter((m) => m.area === a.id && can(m.id));
        if (!mods.length) return null;
        return (
          <div key={a.id} className="mb-4">
            <p className="mb-1 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold tracking-[0.08em] text-side-ink-3 uppercase">
              {a.name}
              {a.offline && (
                <span title="Funciona sin conexión">
                  <WifiOff size={11} aria-hidden />
                  <span className="sr-only">(funciona sin conexión)</span>
                </span>
              )}
            </p>
            {mods.map((m) => {
              const href = moduleHref(org.slug, m);
              const active = m.id === 'dashboard' ? pathname === href : pathname.startsWith(href);
              const Icon = ICONS[m.icon] ?? ICONS.badge!;
              const legacy = m.status !== 'v2' && m.id !== 'dashboard';
              const fuera = !enPlan(acceso, m.id);
              return (
                <Link
                  key={m.id}
                  href={t ? `${href}?t=${encodeURIComponent(t)}` : href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[14px] transition-colors duration-100',
                    active ? 'bg-side-raised font-semibold text-side-ink' : 'text-side-ink-2 hover:bg-side-raised/60 hover:text-side-ink',
                    (legacy || fuera) && !active && 'text-side-ink-3'
                  )}
                  title={fuera ? `Disponible en el plan ${planQueIncluye(m.id).nombre}` : undefined}
                >
                  <Icon size={17} strokeWidth={1.6} className="shrink-0" />
                  <span className="truncate">{m.name}</span>
                  {fuera ? (
                    <Lock size={12} className="ml-auto text-side-ink-3" aria-label="No incluido en el plan" />
                  ) : (
                    legacy && <span className="ml-auto text-[10px] font-semibold tracking-wide text-side-ink-3 uppercase">v1</span>
                  )}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

function useTheme() {
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
  return { dark, toggle };
}

/** Pie del menú: tema y cerrar sesión. */
function UserFooter() {
  const { dark, toggle } = useTheme();
  return (
    <div className="flex items-center gap-1 border-t border-side-rule px-3 py-2.5">
      <button
        onClick={toggle}
        className="flex h-9 flex-1 items-center gap-2.5 rounded-control px-2.5 text-[13px] text-side-ink-2 hover:bg-side-raised hover:text-side-ink"
      >
        {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Modo claro' : 'Modo oscuro'}
      </button>
      <form action={signOutAction}>
        <button aria-label="Cerrar sesión" className="grid size-9 place-items-center rounded-control text-side-ink-2 hover:bg-side-raised hover:text-side-ink">
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );
}

/** Usuario en la barra superior (como v1): iniciales, nombre y rol. */
function UserChip() {
  const { user, roleName } = useOrg();
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
  return (
    <span className="flex items-center gap-2.5 rounded-full border border-rule py-1 pr-3 pl-1" title={user.email}>
      <span aria-hidden className="grid size-8 place-items-center rounded-full bg-ink text-[12px] font-bold text-on-ink">
        {initials}
      </span>
      <span className="hidden leading-tight sm:block">
        <span className="block text-[13px] font-semibold">{user.name.split(' ')[0]}</span>
        <span className="block text-[12px] text-ink-3">{roleName}</span>
      </span>
    </span>
  );
}

/**
 * Selector de temporada (ADR 0011). El estado vive en la URL (`?t=2026`) para que un enlace compartido muestre lo
 * mismo; sin `?t` se ve la temporada actual. Ver otra temporada tiñe el control para que no pase inadvertido.
 */
function TemporadaSelect() {
  const { temporadas, temporadaActual } = useOrg();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  if (!temporadas.length) return null;
  const pedida = Number(sp.get('t'));
  const valor = temporadas.some((x) => x.anio === pedida) ? pedida : (temporadaActual ?? temporadas.at(-1)!.anio);
  const elegida = temporadas.find((x) => x.anio === valor);
  const otra = valor !== temporadaActual;
  function cambiar(anio: number) {
    const q = new URLSearchParams(sp);
    if (anio === temporadaActual) q.delete('t');
    else q.set('t', String(anio));
    const qs = q.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    // Sin señal no se puede pedir la página al servidor: se cambia solo la URL (las vistas offline filtran en el cliente).
    if (!navigator.onLine) window.history.pushState(null, '', url);
    else router.push(url);
  }
  return (
    <span
      className={cn(
        'relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/20',
        otra ? 'border-tinto/30 bg-tinto-soft text-tinto' : 'border-rule-strong text-ink-2 hover:bg-sunken'
      )}
    >
      <CalendarRange size={14} aria-hidden />
      <span className="hidden sm:inline">Temporada</span>
      <span className="tabular">{valor}</span>
      {elegida?.estado === 'cerrada' && <Lock size={12} aria-hidden />}
      <ChevronDown size={13} aria-hidden className="opacity-60" />
      <select
        aria-label="Temporada"
        title={elegida ? `${elegida.inicio} a ${elegida.fin}` : undefined}
        value={valor}
        onChange={(e) => cambiar(Number(e.target.value))}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {[...temporadas].reverse().map((x) => (
          <option key={x.anio} value={x.anio}>
            {x.anio}
            {x.anio === temporadaActual ? ' (actual)' : ''}
            {x.estado === 'cerrada' ? ' · cerrada' : ''}
          </option>
        ))}
      </select>
    </span>
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
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold',
        !s.online ? 'bg-warn-soft text-warn' : s.pending ? 'bg-info-soft text-info' : 'text-ink-3 hover:bg-sunken'
      )}
    >
      {!s.online ? (
        <CloudOff size={14} />
      ) : s.syncing || !s.ready || s.pending ? (
        <RefreshCw size={13} className={cn((s.syncing || !s.ready) && 'animate-spin')} />
      ) : (
        <Check size={14} className="text-ok" />
      )}
      <span className="hidden sm:inline">{label}</span>
      {s.error && <span className="sr-only">{s.error}</span>}
    </button>
  );
}

/** Aviso de la suscripción: prueba por terminar, periodo vencido o solo lectura (F0-7). */
function PlanBanner() {
  const { acceso } = useOrg();
  if (!acceso.aviso) return null;
  return (
    <div
      role="status"
      className={cn(
        'border-b px-4 py-2.5 text-[13px] font-medium sm:px-6',
        acceso.soloLectura ? 'border-bad/20 bg-bad-soft text-bad' : 'border-warn/20 bg-warn-soft text-warn'
      )}
    >
      {acceso.soloLectura && <Lock size={13} className="mr-1.5 inline -translate-y-px" aria-hidden />}
      {acceso.aviso}
    </div>
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
