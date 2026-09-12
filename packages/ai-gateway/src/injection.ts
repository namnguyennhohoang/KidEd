/**
 * Phát hiện prompt injection trong dữ liệu KHÔNG tin cậy (ContentPack, input của trẻ,
 * văn bản upload, tài liệu retrieval) — AI_BEHAVIOR.md §8, CHILD_SAFETY.md T4.
 * Heuristic, cố ý "thà nhầm còn hơn bỏ sót": nghi ngờ -> chuyển sang coach tất định.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(the\s+)?(system|previous|above)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:/i,
  /system\s*prompt/i,
  /\bpretend\s+(to\s+be|you'?re)\b/i,
  /reveal\s+(the\s+)?(answer|solution|system)/i,
  /(bỏ\s*qua|phớt\s*lờ|đừng\s*nghe)\s+(hướng\s*dẫn|chỉ\s*dẫn|quy\s*tắc|lệnh)\s*(trước|ở\s*trên)?/i,
  /(giả\s*vờ|đóng\s*vai)\s+(là|làm)\s+/i,
  /(cho|nói|đọc)\s+(con|tôi|mình)\s+(đáp\s*án|lời\s*giải|kết\s*quả)\s*(ngay|luôn)/i,
  /bạn\s+(bây\s*giờ|giờ)\s+là\s+/i,
  /\bbase64\b|^[A-Za-z0-9+/]{200,}={0,2}$/m,
];

export interface InjectionScan {
  flagged: boolean;
  reasons: string[];
}

export function detectInjection(text: string | undefined | null): InjectionScan {
  if (!text) return { flagged: false, reasons: [] };
  const reasons: string[] = [];

  if (text.length > 4000) reasons.push('quá dài (nghi vấn nhồi lệnh)');
  for (const re of INJECTION_PATTERNS) {
    if (re.test(text)) reasons.push(`khớp mẫu: ${re.source.slice(0, 48)}`);
  }
  // Nhiều "role marker" kiểu chat.
  const roleMarkers = (text.match(/\b(system|assistant|user)\s*:/gi) ?? []).length;
  if (roleMarkers >= 2) reasons.push('nhiều role marker kiểu hội thoại');

  return { flagged: reasons.length > 0, reasons };
}

export function scanAll(texts: Array<string | undefined | null>): InjectionScan {
  const reasons: string[] = [];
  for (const t of texts) {
    const s = detectInjection(t);
    if (s.flagged) reasons.push(...s.reasons);
  }
  return { flagged: reasons.length > 0, reasons };
}
