import type { ReactNode } from 'react';

/** Encabezado de página: kicker (área) en versalitas + título en la serif de etiqueta. */
export function PageHeader({
  area,
  title,
  description,
  actions,
  children
}: {
  area?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {area && <p className="mb-1 text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">{area}</p>}
        <h1 className="font-label text-[28px] leading-[1.15] font-semibold tracking-[-0.015em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[14px] text-ink-2">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ title, text, action, icon }: { title: string; text?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-rule-strong px-6 py-14 text-center">
      {icon && <div className="mb-3 text-ink-4">{icon}</div>}
      <p className="font-label text-[18px] font-semibold">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Cifra destacada: etiqueta 11px versalitas, valor 24px/600 tabular. */
export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium tracking-[0.08em] text-ink-3 uppercase">{label}</p>
      <p className="tabular mt-1 text-[24px] leading-none font-semibold tracking-[-0.01em]">{value}</p>
      {sub && <p className="mt-1 text-[12px] text-ink-3">{sub}</p>}
    </div>
  );
}
