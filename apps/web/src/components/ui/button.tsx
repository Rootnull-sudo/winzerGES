import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-on-ink hover:bg-ink/90',
  secondary: 'bg-raised text-ink border border-rule-strong hover:bg-sunken',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-raised text-bad border border-rule-strong hover:bg-bad-soft'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

/** Botón: 36px (md) / 30px (sm), 14px/500. Feedback de presión con scale .97. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', className, ...p }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium',
        'transition-[background-color,transform,opacity] duration-150 ease-out-quick active:scale-[0.97]',
        'disabled:pointer-events-none disabled:opacity-45',
        size === 'md' ? 'h-9 px-3.5 text-[14px]' : 'h-[30px] px-2.5 text-[13px]',
        variants[variant],
        className
      )}
      {...p}
    />
  );
});
