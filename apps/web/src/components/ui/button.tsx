import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink border border-ink hover:bg-ink/88',
  secondary: 'bg-transparent text-ink border border-ink hover:bg-sunken',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-transparent text-bad border border-bad/60 hover:bg-bad-soft'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

/** Botón rectangular de borde fino: 40px (md) / 32px (sm). Feedback de presión con scale .97. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', className, ...p }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium',
        'transition-[background-color,transform,opacity] duration-150 ease-out-quick active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'h-10 px-4 text-[14px]' : 'h-8 px-3 text-[13px]',
        variant === 'primary' && 'font-semibold',
        variants[variant],
        className
      )}
      {...p}
    />
  );
});
