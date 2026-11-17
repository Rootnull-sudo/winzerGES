import type { ReactNode } from 'react';

/**
 * Encabezado de página: ruta (Inicio / Área / Módulo) como en v1, título en la serif del logo,
 * descripción y acciones a la derecha.
 */
export function PageHeader({
  area,
  title,
  description,
  actions,
  actionsDesktopOnly,
  children
}: {
  /** Área del menú; se muestra en la ruta. */
  area?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** En móvil la acción va como botón ancho dentro de la vista (más fácil de tocar en el viñedo). */
  actionsDesktopOnly?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <nav aria-label="Ubicación" className="mb-1.5 text-[13px] text-ink-3">
          {area ? `Inicio / ${area} / ${title}` : 'Inicio'}
        </nav>
        <h1 className="titulo text-[30px] sm:text-[36px]">{title}</h1>
        {description && <p className="mt-2 max-w-3xl text-[15px] text-ink-2">{description}</p>}
        {children}
      </div>
      {actions && <div className={`shrink-0 flex-wrap gap-2 ${actionsDesktopOnly ? 'hidden sm:flex' : 'flex'}`}>{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-rule-strong bg-raised px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-4">{icon}</div>}
      <p className="font-label text-[22px]">{title}</p>
      {text && <p className="mt-2 max-w-sm text-[14px] text-ink-3">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Tarjeta de cifra (como v1): etiqueta, ícono en recuadro, valor grande y una línea de contexto. */
export function Stat({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-card border border-rule bg-raised px-4.5 py-4">
      <p className="flex items-center justify-between gap-2 text-[13px] font-semibold text-ink-2">
        <span className="truncate">{label}</span>
        {icon && <span className="grid size-[30px] shrink-0 place-items-center rounded-control bg-sunken text-ink-2">{icon}</span>}
      </p>
      <p className="tabular text-[28px] leading-none font-bold tracking-[-0.01em]">{value}</p>
      {sub && <p className="text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}

/** Título de sección dentro de una página: serif del logo. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-label text-[21px] leading-tight ${className ?? ''}`}>{children}</h2>;
}

/** Grupo de tarjetas (12px de separación; 4 columnas en escritorio, 2 en móvil). */
export function StatGrid({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="mb-6">
      {title && <h2 className="mb-2.5 text-[12px] font-bold tracking-[0.08em] text-ink-2 uppercase">{title}</h2>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
    </section>
  );
}
