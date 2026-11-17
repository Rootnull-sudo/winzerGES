import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink font-bold hover:bg-ink/88',
  secondary: 'bg-raised text-ink border border-rule-strong font-semibold hover:bg-sunken',
  ghost: 'text-ink-2 font-medium hover:bg-sunken hover:text-ink',
  danger: 'bg-raised text-bad border border-rule-strong font-semibold hover:bg-bad-soft'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

/** Botón: 40px (md) / 32px (sm), esquinas de 6px. Feedback de presión con scale .97. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', className, ...p }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control',
        'transition-[background-color,transform,opacity] duration-150 ease-out-quick active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'h-10 px-4 text-[14px]' : 'h-8 px-3 text-[13px]',
        variants[variant],
        className
      )}
      {...p}
    />
  );
});
