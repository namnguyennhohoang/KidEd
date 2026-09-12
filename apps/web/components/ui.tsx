import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, forwardRef } from 'react';

/** Component tối giản bằng Tailwind. Sẽ thay bằng shadcn/ui khi cần (ADR 0001). */

export function Button({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'big' }) {
  const base =
    'inline-flex items-center justify-center rounded-xl font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500';
  const styles = {
    primary: 'bg-slate-900 text-white px-4 py-2 hover:bg-slate-700',
    ghost: 'bg-white text-slate-900 border border-slate-300 px-4 py-2 hover:bg-slate-50',
    big: 'bg-white text-slate-900 border-2 border-slate-300 px-6 py-8 text-xl hover:border-slate-900 hover:bg-slate-50 w-full',
  }[variant];
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}

export const Field = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(
  function Field({ label, id, className = '', ...props }, ref) {
    return (
      <label htmlFor={id} className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
        <input
          ref={ref}
          id={id}
          className={`w-full rounded-lg border border-slate-300 px-3 py-2 focus:border-slate-900 focus:outline-none ${className}`}
          {...props}
        />
      </label>
    );
  },
);

export function Card({
  children,
  className = '',
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${className}`} {...props}>
      {children}
    </div>
  );
}
