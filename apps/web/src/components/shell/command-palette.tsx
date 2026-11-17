'use client';
import { MODULES } from '@winzer/domain';
import { Command } from 'cmdk';
import { useRouter } from 'next/navigation';
import { moduleHref } from '@/lib/routes';
import { ICONS } from './icons';
import { useCan, useOrg } from './org-context';

/** Ctrl/⌘ + K. Sin animación: se usa cientos de veces al día. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { org } = useOrg();
  const can = useCan();
  const router = useRouter();
  const go = (href: string) => {
    onClose();
    router.push(href);
  };
  const actions = [
    can('catastro', 'c') && { label: 'Nuevo cuartel', href: `/${org.slug}/catastro?nuevo=1` },
    can('clientes', 'c') && { label: 'Nuevo cliente', href: `/${org.slug}/clientes?nuevo=1` },
    can('usuarios', 'c') && { label: 'Invitar a alguien a la viña', href: `/${org.slug}/usuarios` },
    can('configuracion', 'e') && { label: 'Importar respaldo de v1', href: `/${org.slug}/configuracion#importar` }
  ].filter(Boolean) as { label: string; href: string }[];
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 px-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <Command
        label="Paleta de comandos"
        className="mx-auto max-w-lg overflow-hidden rounded-[12px] border border-rule-strong bg-raised"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <Command.Input
          autoFocus
          placeholder="Buscar módulo o acción…"
          className="h-12 w-full border-b border-rule bg-transparent px-4 text-[15px] outline-none placeholder:text-ink-4"
        />
        <Command.List className="max-h-[50vh] overflow-y-auto p-1.5">
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-3">Sin resultados.</Command.Empty>
          {actions.length > 0 && (
            <Command.Group
              heading="Acciones"
              className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase"
            >
              {actions.map((a) => (
                <Command.Item
                  key={a.label}
                  onSelect={() => go(a.href)}
                  className="flex h-9 cursor-pointer items-center rounded-control px-2.5 text-[14px] data-[selected=true]:bg-sunken"
                >
                  {a.label}
                </Command.Item>
              ))}
            </Command.Group>
          )}
          <Command.Group
            heading="Módulos"
            className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase"
          >
            {MODULES.filter((m) => can(m.id)).map((m) => {
              const Icon = ICONS[m.icon] ?? ICONS.badge!;
              return (
                <Command.Item
                  key={m.id}
                  value={m.name}
                  onSelect={() => go(moduleHref(org.slug, m))}
                  className="flex h-9 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-[14px] data-[selected=true]:bg-sunken"
                >
                  <Icon size={15} className="text-ink-3" /> {m.name}
                  {m.status !== 'v2' && m.id !== 'dashboard' && <span className="ml-auto text-[11px] text-ink-4">en v1</span>}
                </Command.Item>
              );
            })}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
