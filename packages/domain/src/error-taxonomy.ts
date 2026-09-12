/**
 * Phân loại lỗi theo NGUYÊN NHÂN (spec Module C). Dùng để hiểu và hỗ trợ học tập,
 * KHÔNG để chấm điểm hay xếp hạng. Sai lầm là dữ liệu học tập.
 */
export const ERROR_CAUSES = [
  'KNOWLEDGE_GAP', // thiếu kiến thức
  'QUESTION_LANGUAGE', // không hiểu ngôn ngữ câu hỏi
  'MISSED_GIVEN_INFO', // đọc sót dữ kiện
  'MISCONCEPTION', // hiểu sai khái niệm
  'NO_STRATEGY', // chưa có chiến lược
  'COMPUTATION_SLIP', // tính toán / thao tác sai
  'TIME_PRESSURE', // áp lực thời gian
  'HINT_DEPENDENCE', // phụ thuộc gợi ý
  'CANT_EXPLAIN', // biết làm nhưng không diễn đạt được
] as const;

export type ErrorCause = (typeof ERROR_CAUSES)[number];

export const ERROR_CAUSE_VI: Record<ErrorCause, string> = {
  KNOWLEDGE_GAP: 'Thiếu kiến thức nền',
  QUESTION_LANGUAGE: 'Chưa hiểu ngôn ngữ của câu hỏi',
  MISSED_GIVEN_INFO: 'Đọc sót dữ kiện',
  MISCONCEPTION: 'Hiểu sai khái niệm',
  NO_STRATEGY: 'Chưa có chiến lược giải',
  COMPUTATION_SLIP: 'Tính toán / thao tác sai',
  TIME_PRESSURE: 'Áp lực thời gian',
  HINT_DEPENDENCE: 'Phụ thuộc gợi ý',
  CANT_EXPLAIN: 'Biết làm nhưng chưa diễn đạt được',
};

export function isErrorCause(v: string): v is ErrorCause {
  return (ERROR_CAUSES as readonly string[]).includes(v);
}

export interface CauseSignals {
  repeatedErrors: boolean;
  languageLoadHigh: boolean;
  representationIsAbstract: boolean;
  hintsRequested: number;
  attemptsBeforeFirstHint: number;
  timePressure: boolean;
  explanationMissing: boolean;
}

/**
 * Gợi ý (advisory) một vài nguyên nhân khả dĩ từ tín hiệu phiên — để phụ huynh/giáo viên
 * cân nhắc, KHÔNG phải kết luận. Trả danh sách rỗng nếu không đủ tín hiệu.
 */
export function suggestCauses(s: CauseSignals): ErrorCause[] {
  const out = new Set<ErrorCause>();
  if (s.repeatedErrors && s.languageLoadHigh) out.add('QUESTION_LANGUAGE');
  if (s.repeatedErrors && s.representationIsAbstract) out.add('MISCONCEPTION');
  if (s.hintsRequested >= 3 && s.attemptsBeforeFirstHint <= 1) out.add('HINT_DEPENDENCE');
  if (s.hintsRequested === 0 && s.repeatedErrors) out.add('NO_STRATEGY');
  if (s.timePressure) out.add('TIME_PRESSURE');
  if (s.explanationMissing) out.add('CANT_EXPLAIN');
  return [...out];
}
