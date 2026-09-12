import type { Band, HelpLadderLevel, Stage } from '../types.js';

/**
 * Ảnh chụp trạng thái phiên tại một lượt — đầu vào cho rule engine.
 * Chỉ chứa dữ liệu tối thiểu cần cho quyết định; không PII, không nhãn con người.
 */
export interface SessionSnapshot {
  childAgeYears: number;
  stage: Stage;
  taskType: string;

  /** Số lần trẻ đã thử trong nhiệm vụ hiện tại. */
  attemptsMade: number;
  /** Từ ContentPack: minimum_attempts_before_solution (>= 1). */
  minimumAttemptsBeforeSolution: number;

  /** Mức thang trợ giúp đã hiển thị gần nhất (0 nếu chưa có). */
  currentHelpLadderLevel: HelpLadderLevel;
  /** Trẻ có bấm "con cần giúp" ở lượt này không. */
  childRequestedHelp: boolean;

  /** Giây kể từ khi hệ thống nêu prompt gần nhất. */
  secondsSincePrompt: number;
  /** Thời gian chờ tối thiểu cấu hình theo tuổi/nhiệm vụ (PEDAGOGY.md §2). */
  configuredWaitSeconds: number;

  /** Chuỗi lần hoàn thành độc lập liên tiếp (không xin trợ giúp). */
  consecutiveIndependentSuccesses: number;
  /** Ngưỡng cấu hình để gỡ một lớp hint. */
  independentSuccessThreshold: number;

  independenceLevel: Band;
  masteryLevel: Band;

  repeatedErrors: boolean;
  languageLoadHigh: boolean;
  representationIsAbstract: boolean;
  presentationAnxietyObserved: boolean;

  /** Tín hiệu mệt/quá tải do phụ huynh hoặc heuristic phiên quan sát (không chẩn đoán). */
  fatigue: {
    sessionMinutes: number;
    configuredSessionMinutesCap: number;
    overloadObserved: boolean;
    distressObserved: boolean;
  };

  /** Câu hỏi/tình huống ngoài phạm vi nội dung đã duyệt. */
  outOfScopeRequest: boolean;
}

export function defaultSnapshot(overrides: Partial<SessionSnapshot> = {}): SessionSnapshot {
  return {
    childAgeYears: 6,
    stage: 'BASE_CAMP',
    taskType: 'generic',
    attemptsMade: 0,
    minimumAttemptsBeforeSolution: 1,
    currentHelpLadderLevel: 0,
    childRequestedHelp: false,
    secondsSincePrompt: 0,
    configuredWaitSeconds: 12,
    consecutiveIndependentSuccesses: 0,
    independentSuccessThreshold: 3,
    independenceLevel: 'MEDIUM',
    masteryLevel: 'MEDIUM',
    repeatedErrors: false,
    languageLoadHigh: false,
    representationIsAbstract: false,
    presentationAnxietyObserved: false,
    fatigue: {
      sessionMinutes: 0,
      configuredSessionMinutesCap: 10,
      overloadObserved: false,
      distressObserved: false,
    },
    outOfScopeRequest: false,
    ...overrides,
  };
}
