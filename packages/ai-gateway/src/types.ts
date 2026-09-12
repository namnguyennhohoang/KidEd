import type { CoachDirective, HelpLadderLevel } from '@tiny/domain';

/** Khớp packages/content-schema/schemas/ai-coach-response.schema.json */
export interface AiCoachResponse {
  intent: string;
  child_message: string;
  hint_level: number;
  expected_action: string;
  wait_seconds: number;
  allowed_next_actions: string[];
  safety_flag: string | null;
  parent_note: string | null;
}

export interface UnitHint {
  level: number;
  type: 'REPHRASE' | 'QUESTION' | 'VISUAL' | 'STRATEGY_CHOICE' | 'WORKED_EXAMPLE';
  content?: string | undefined;
  content_ref?: string | undefined;
}

export interface CoachTurnInput {
  directive: CoachDirective;
  unitHints: UnitHint[];
  prompts: {
    hook?: string | undefined;
    plan_prompt?: string | undefined;
    explain_prompt?: string | undefined;
    reflection_prompt?: string | undefined;
  };
  childRequestedHelp: boolean;
  /** Tuổi để chọn thời gian chờ; không dùng để gắn nhãn. */
  childAgeYears: number;
  /**
   * Đoạn tham chiếu ngắn từ KHO NỘI DUNG ĐÃ DUYỆT (hints của nhiệm vụ, mô tả kỹ năng...).
   * Gateway đã quét injection trước khi truyền vào đây. Provider chỉ dùng để DIỄN ĐẠT,
   * không chép nguyên văn đáp án. Deterministic coach bỏ qua trường này.
   */
  retrievedContext?: string[] | undefined;
}

/** Port cho nhà cung cấp AI thật (Giai đoạn 2). Giai đoạn 1: chỉ DeterministicCoach. */
export interface AiProvider {
  readonly name: string;
  coachTurn(input: CoachTurnInput): Promise<AiCoachResponse>;
}

export type { CoachDirective, HelpLadderLevel };
