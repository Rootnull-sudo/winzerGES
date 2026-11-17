'use client';
import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Diálogo sobre <dialog> nativo: foco atrapado, Esc y fondo inerte los da el navegador.
 * En móvil se ancla abajo (hoja), en escritorio queda centrado.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md'
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={cn(
        'm-0 mt-auto w-full max-w-none border-t border-ink bg-raised p-0 text-ink backdrop:bg-black/40',
        'sm:m-auto sm:border',
        size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg',
        'open:animate-[dlg-in_200ms_cubic-bezier(0.23,1,0.32,1)]'
      )}
    >
      {open && (
        <div className="flex max-h-[88dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
            <div>
              <h2 className="font-label text-[24px] leading-tight">{title}</h2>
              {description && <p className="mt-1 text-[13px] text-ink-3">{description}</p>}
            </div>
            <button onClick={onClose} aria-label="Cerrar" className="-mr-1.5 grid size-10 place-items-center text-ink-3 hover:bg-sunken hover:text-ink">
              <X size={18} />
            </button>
          </header>
          <div className="overflow-y-auto px-6 py-5">{children}</div>
          {footer && <footer className="flex justify-end gap-2 border-t border-rule px-6 py-4">{footer}</footer>}
        </div>
      )}
      <style>{`@keyframes dlg-in{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}`}</style>
    </dialog>
  );
}
