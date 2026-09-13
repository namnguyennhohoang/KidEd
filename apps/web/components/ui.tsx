import { type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, forwardRef } from 'react';

/** Component tối giản bằng Tailwind. Sẽ thay bằng shadcn/ui khi cần (ADR 0001). */

export function Button({
  className = '',
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'big' | 'success' | 'warm' | 'calm';
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-2xl font-semibold transition-transform duration-150 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 focus:outline-none focus:ring-4 focus:ring-offset-2';
  const styles = {
    primary: 'bg-slate-900 text-white px-4 py-2 hover:bg-slate-700 focus:ring-slate-300',
    ghost: 'bg-white text-slate-900 border border-slate-300 px-4 py-2 hover:bg-slate-50 focus:ring-slate-200',
    // Dùng cho lựa chọn/phản hồi của trẻ (Choose, Reflect) — bo tròn lớn, viền ấm, dễ chạm.
    big: 'bg-white text-slate-900 border-2 border-sky-200 px-8 py-9 text-2xl hover:border-sky-400 hover:bg-sky-50 w-full shadow-sm focus:ring-sky-200',
    // 3 màu có Ý NGHĨA cố định xuyên suốt màn học của trẻ (nhất quán = dễ đoán, giảm tải nhận thức):
    // xanh lá = hoàn thành/đi tiếp, vàng = cần trợ giúp, xanh dương = bình tĩnh/nghỉ/việc phụ.
    success: 'bg-emerald-500 text-white px-6 py-4 text-xl hover:bg-emerald-600 focus:ring-emerald-200 shadow-sm',
    warm: 'bg-amber-400 text-amber-950 px-6 py-4 text-xl hover:bg-amber-500 focus:ring-amber-200 shadow-sm',
    calm: 'bg-sky-100 text-sky-900 px-5 py-3 text-lg hover:bg-sky-200 focus:ring-sky-200',
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
          className={`w-full rounded-xl border border-slate-300 px-3 py-2 focus:border-sky-500 focus:outline-none focus:ring-4 focus:ring-sky-100 ${className}`}
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
