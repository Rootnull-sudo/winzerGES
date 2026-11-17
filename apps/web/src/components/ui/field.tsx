import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** Controles hundidos (más oscuros que la superficie): "aquí se escribe". */
export const controlClass =
  'w-full rounded-control border border-rule-strong bg-paper px-3 text-[15px] text-ink placeholder:text-ink-3 ' +
  'transition-[border-color,box-shadow] duration-150 hover:border-ink-3 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink ' +
  'aria-[invalid=true]:border-bad/60 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cn(controlClass, 'h-10', className)} {...p} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...p }, ref) {
  return <select ref={ref} className={cn(controlClass, 'h-10 pr-8', className)} {...p} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cn(controlClass, 'min-h-20 py-2', className)} {...p} />;
});

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  unit?: string;
  required?: boolean;
  className?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

/** Etiqueta 13px/500, ayuda 12px/ink-3, error 12px/bad junto al campo (como en v1). */
export function Field({ label, hint, error, unit, required, className, children }: FieldProps) {
  const id = useId();
  const descId = hint || error ? id + '-d' : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="text-ink-4"> *</span>}
        {unit && <span className="ml-1 font-normal text-ink-3">({unit})</span>}
      </label>
      {children(id, descId)}
      {(error || hint) && (
        <p id={descId} className={cn('text-[12px]', error ? 'text-bad' : 'text-ink-3')}>
          {error || hint}
        </p>
      )}
    </div>
  );
}
