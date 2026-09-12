/**
 * Kiểm duyệt đầu ra của coach (LLM hoặc tất định) — không gắn nhãn, không chẩn đoán,
 * không lộ PII, không tạo áp lực (PEDAGOGY.md §3.3, CHILD_SAFETY.md R3/R4).
 */

const LABEL_DIAGNOSIS: RegExp[] = [
  /\b(thông\s*minh|năng\s*khiếu|thiên\s*tài|giỏi\s*quá|xuất\s*sắc\s*quá)\b/i,
  /\b(nhút\s*nhát|rụt\s*rè|lười|kém|chậm\s*hiểu|ngu|dốt|vô\s*dụng)\b/i,
  /\b(adhd|tự\s*kỷ|tăng\s*động|lo\s*âu|trầm\s*cảm|rối\s*loạn)\b/i,
  /\biq\b|\bchỉ\s*số\s*thông\s*minh\b/i,
  /(giỏi|kém)\s+hơn\s+(bạn|các\s*bạn|trẻ)/i,
];

const PRESSURE: RegExp[] = [
  /(phải|nhất\s*định)\s+(đậu|đỗ|thắng|đứng\s*nhất)/i,
  /(xếp\s*hạng|thứ\s*hạng|top\s*\d)/i,
  /nếu\s+không\s+.*(thất\s*bại|thua\s*kém|kém\s*cỏi)/i,
];

export interface ModerationResult {
  ok: boolean;
  violations: string[];
}

export function moderateCoachMessage(message: string, parentNote?: string | null): ModerationResult {
  const violations: string[] = [];
  const hay = `${message}\n${parentNote ?? ''}`;

  for (const re of LABEL_DIAGNOSIS) if (re.test(hay)) violations.push(`gắn nhãn/chẩn đoán: ${re.source.slice(0, 40)}`);
  for (const re of PRESSURE) if (re.test(hay)) violations.push(`tạo áp lực: ${re.source.slice(0, 40)}`);

  return { ok: violations.length === 0, violations };
}

/**
 * Rò rỉ PII trong đầu ra: tên thật đã redact, số điện thoại, email, chuỗi số dài.
 * `knownNames` là các token nhận dạng KHÔNG được xuất hiện lại (vd tên trẻ, tên trường).
 */
export function detectPiiLeak(message: string, knownNames: string[] = []): string[] {
  const hits: string[] = [];
  const lower = message.toLowerCase();
  for (const n of knownNames) {
    const t = n.trim().toLowerCase();
    if (t.length >= 2 && lower.includes(t)) hits.push(`lộ định danh: "${n}"`);
  }
  if (/\b\d{9,12}\b/.test(message)) hits.push('có chuỗi số dài giống SĐT/CMND');
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(message)) hits.push('có email');
  return hits;
}
