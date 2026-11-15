import type { ComponentProps } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const base =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:cursor-not-allowed disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-indigo-600 text-white shadow-sm hover:bg-indigo-500',
  secondary: 'border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-500',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

export const buttonClasses = (variant: Variant = 'secondary', className = '') =>
  `${base} ${variants[variant]} ${className}`.trim();

export function Button({
  variant,
  className,
  type = 'button',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}

export function ButtonLink({ variant, className, ...props }: LinkProps & { variant?: Variant }) {
  return <Link className={buttonClasses(variant, className)} {...props} />;
}
