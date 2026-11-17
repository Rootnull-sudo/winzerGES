import type { ReactNode } from 'react';

/**
 * Encabezado de página: título en versales de la serif del logo, una línea de hechos debajo
 * (en vez de tarjetas de cifras) y las acciones a la derecha, todo cerrado por una línea de tinta.
 * `area` se mantiene por compatibilidad pero no se pinta: el menú ya dice dónde estás.
 */
export function PageHeader({
  title,
  description,
  actions,
  actionsDesktopOnly,
  children
}: {
  area?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** En móvil la acción va como botón ancho dentro de la vista (más fácil de tocar en el viñedo). */
  actionsDesktopOnly?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-5 border-b border-ink pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="titulo text-[34px] sm:text-[44px]">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-[15px] text-ink-2">{description}</p>}
        {children}
      </div>
      {actions && <div className={`shrink-0 flex-wrap gap-2 ${actionsDesktopOnly ? 'hidden sm:flex' : 'flex'}`}>{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center border border-dashed border-rule-strong px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-3">{icon}</div>}
      <p className="font-label text-[22px]">{title}</p>
      {text && <p className="mt-2 max-w-sm text-[14px] text-ink-3">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Cifra: etiqueta 12px en ink-3, valor 26px/600 tabular. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className="tabular mt-1.5 text-[26px] leading-none font-semibold tracking-[-0.01em]">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}

/** Título de sección dentro de una página: serif del logo, sin versales. */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={`font-label text-[22px] leading-tight ${className ?? ''}`}>{children}</h2>;
}
