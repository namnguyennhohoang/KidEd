/**
 * Thư viện minh hoạ SVG dùng chung cho nội dung học (thay/kèm emoji khi cần hình rõ ràng hơn).
 * Mỗi icon là một hàm vẽ độc lập, viewBox 0 0 100 100, phong cách flat bo tròn, màu tươi sáng —
 * khớp ngôn ngữ thiết kế đã có ở /learn (Button variants big/success/warm/calm).
 *
 * Thêm icon mới: viết hàm vẽ rồi đăng ký key vào REGISTRY bên dưới. Content chỉ cần tham chiếu
 * đúng key qua `attempt_options[].visual` / `match_pairs[].visual` / `quest_flow.hook_visual` —
 * không cần sửa schema hay logic /learn.
 */
import type { ReactNode } from 'react';

function Base({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={label} className="h-full w-full">
      {children}
    </svg>
  );
}

const ICONS: Record<string, ReactNode> = {
  'colour-red': (
    <>
      <circle cx="50" cy="52" r="34" fill="#ef4444" />
      <path d="M50 20 Q56 30 50 38 Q44 30 50 20 Z" fill="#16a34a" />
    </>
  ),
  'colour-yellow': (
    <>
      <path d="M30 45 Q50 15 70 45 Q76 60 65 75 Q50 85 35 75 Q24 60 30 45 Z" fill="#facc15" />
    </>
  ),
  'colour-blue': (
    <path d="M50 18 C66 42 74 56 74 68 A24 24 0 1 1 26 68 C26 56 34 42 50 18 Z" fill="#3b82f6" />
  ),
  'colour-green': (
    <path d="M50 20 C75 30 80 55 65 75 C55 88 40 82 32 68 C22 50 32 28 50 20 Z" fill="#22c55e" />
  ),
  cat: (
    <>
      <ellipse cx="50" cy="58" rx="28" ry="24" fill="#f59e0b" />
      <path d="M26 40 L34 20 L44 38 Z" fill="#f59e0b" />
      <path d="M74 40 L66 20 L56 38 Z" fill="#f59e0b" />
      <circle cx="40" cy="55" r="4" fill="#1e293b" />
      <circle cx="60" cy="55" r="4" fill="#1e293b" />
      <path d="M44 66 Q50 72 56 66" stroke="#1e293b" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M50 62 L45 64 M50 62 L55 64" stroke="#1e293b" strokeWidth="2" />
    </>
  ),
  dog: (
    <>
      <ellipse cx="50" cy="58" rx="28" ry="24" fill="#a16207" />
      <ellipse cx="28" cy="45" rx="10" ry="16" fill="#78350f" transform="rotate(-20 28 45)" />
      <ellipse cx="72" cy="45" rx="10" ry="16" fill="#78350f" transform="rotate(20 72 45)" />
      <circle cx="40" cy="56" r="4" fill="#1e293b" />
      <circle cx="60" cy="56" r="4" fill="#1e293b" />
      <ellipse cx="50" cy="66" rx="6" ry="4" fill="#1e293b" />
    </>
  ),
  chicken: (
    <>
      <ellipse cx="50" cy="60" rx="24" ry="22" fill="#fef9c3" />
      <circle cx="50" cy="32" r="14" fill="#fef9c3" />
      <path d="M42 22 Q46 12 52 20 Q58 10 60 22" fill="#ef4444" />
      <path d="M50 34 L60 38 L50 40 Z" fill="#f97316" />
      <circle cx="46" cy="30" r="2.5" fill="#1e293b" />
    </>
  ),
  elephant: (
    <>
      <ellipse cx="46" cy="52" rx="26" ry="22" fill="#94a3b8" />
      <path d="M34 60 Q26 78 32 88 Q38 80 40 62 Z" fill="#94a3b8" />
      <ellipse cx="76" cy="46" rx="12" ry="18" fill="#cbd5e1" />
      <circle cx="40" cy="48" r="3.5" fill="#1e293b" />
    </>
  ),
  bird: (
    <>
      <ellipse cx="52" cy="55" rx="22" ry="18" fill="#38bdf8" />
      <circle cx="34" cy="42" r="12" fill="#38bdf8" />
      <path d="M22 42 L10 38 L22 48 Z" fill="#fb923c" />
      <path d="M60 60 Q80 55 78 70 Q64 72 60 60 Z" fill="#0ea5e9" />
      <circle cx="30" cy="40" r="2.5" fill="#1e293b" />
    </>
  ),
  mother: (
    <>
      <circle cx="50" cy="34" r="16" fill="#fbcfe8" />
      <path d="M50 18 Q66 22 64 40 L36 40 Q34 22 50 18 Z" fill="#831843" />
      <path d="M28 90 Q30 58 50 56 Q70 58 72 90 Z" fill="#ec4899" />
    </>
  ),
  father: (
    <>
      <circle cx="50" cy="34" r="16" fill="#bfdbfe" />
      <path d="M36 26 Q50 14 64 26 L60 32 Q50 24 40 32 Z" fill="#1e3a8a" />
      <path d="M28 90 Q30 58 50 56 Q70 58 72 90 Z" fill="#2563eb" />
    </>
  ),
  sibling: (
    <>
      <circle cx="50" cy="36" r="14" fill="#fde68a" />
      <path d="M32 90 Q34 62 50 60 Q66 62 68 90 Z" fill="#f59e0b" />
    </>
  ),
  grandparent: (
    <>
      <circle cx="50" cy="34" r="16" fill="#e5e7eb" />
      <path d="M34 30 Q50 16 66 30 L64 24 Q50 14 36 24 Z" fill="#f8fafc" />
      <path d="M28 90 Q30 58 50 56 Q70 58 72 90 Z" fill="#64748b" />
    </>
  ),
  'weather-sun': (
    <>
      <circle cx="50" cy="50" r="18" fill="#fbbf24" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <rect key={a} x="48" y="8" width="4" height="14" rx="2" fill="#fbbf24" transform={`rotate(${a} 50 50)`} />
      ))}
    </>
  ),
  'weather-rain': (
    <>
      <ellipse cx="50" cy="42" rx="26" ry="16" fill="#94a3b8" />
      {[32, 50, 68].map((x) => (
        <path key={x} d={`M${x} 62 L${x - 4} 78 Q${x} 84 ${x + 4} 78 Z`} fill="#38bdf8" />
      ))}
    </>
  ),
  'weather-cloud': <ellipse cx="50" cy="52" rx="28" ry="18" fill="#cbd5e1" />,
  'weather-snow': (
    <>
      <ellipse cx="50" cy="40" rx="26" ry="15" fill="#e2e8f0" />
      {[34, 50, 66].map((x) => (
        <circle key={x} cx={x} cy="70" r="4" fill="#bae6fd" />
      ))}
    </>
  ),
  'size-compare': (
    <>
      <circle cx="28" cy="70" r="14" fill="#38bdf8" />
      <circle cx="68" cy="58" r="26" fill="#0ea5e9" />
    </>
  ),
  'shadow-diagram': (
    <>
      <circle cx="26" cy="30" r="8" fill="#fbbf24" />
      <line x1="26" y1="30" x2="52" y2="60" stroke="#fbbf24" strokeWidth="3" />
      <rect x="48" y="50" width="10" height="24" fill="#78716c" />
      <ellipse cx="72" cy="82" rx="20" ry="6" fill="#1e293b" opacity="0.55" />
    </>
  ),
  shirt: (
    <path d="M32 26 L44 18 Q50 24 56 18 L68 26 L62 40 L58 36 L58 84 L42 84 L42 36 L38 40 Z" fill="#f97316" />
  ),
  trousers: <path d="M36 20 H64 L66 88 H56 L50 46 L44 88 H34 Z" fill="#1d4ed8" />,
  shoes: (
    <>
      <path d="M18 78 Q18 66 32 66 L44 66 L44 78 Z" fill="#ef4444" />
      <path d="M56 78 Q56 66 70 66 L82 66 L82 78 Z" fill="#ef4444" />
    </>
  ),
  hat: <path d="M26 62 Q50 20 74 62 Z M20 62 H80 V70 H20 Z" fill="#7c3aed" />,
  'food-apple': (
    <>
      <circle cx="50" cy="58" r="26" fill="#ef4444" />
      <path d="M50 32 Q54 22 62 24" stroke="#78350f" strokeWidth="4" fill="none" strokeLinecap="round" />
    </>
  ),
  'food-banana': (
    <path d="M30 70 Q30 30 60 24 Q66 22 66 30 Q40 36 42 70 Q42 78 32 76 Q28 74 30 70 Z" fill="#facc15" />
  ),
  'food-broccoli': (
    <>
      <circle cx="38" cy="34" r="14" fill="#22c55e" />
      <circle cx="58" cy="30" r="14" fill="#22c55e" />
      <circle cx="66" cy="46" r="12" fill="#16a34a" />
      <rect x="44" y="44" width="10" height="30" fill="#84cc16" />
    </>
  ),
  'food-rice': <ellipse cx="50" cy="60" rx="30" ry="16" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="2" />,
};

/** Danh sách id hợp lệ — dùng để đối chiếu khi soạn content (không bắt buộc, chỉ tham khảo). */
export const ILLUSTRATION_IDS = Object.keys(ICONS);

/** Không khớp id nào -> trả về null (web bỏ qua, không lỗi) thay vì crash. */
export function Illustration({ id, label, className = '' }: { id: string; label: string; className?: string }) {
  const icon = ICONS[id];
  if (!icon) return null;
  return (
    <div className={className}>
      <Base label={label}>{icon}</Base>
    </div>
  );
}
