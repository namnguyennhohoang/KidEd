/** Kiểu dùng chung cho domain. Không import ORM/HTTP ở package này. */

export const STAGES = [
  'BASE_CAMP',
  'EXPLORER',
  'TDN_READINESS',
  'SPECIALISATION',
  'SPEC_HS_READINESS',
  'GLOBAL_SCHOLAR',
] as const;
export type Stage = (typeof STAGES)[number];

export type Band = 'LOW' | 'MEDIUM' | 'HIGH';

/** Thang trợ giúp 0–6 (PEDAGOGY.md §2). 6 = trình bày lời giải sau khi trẻ đã thử. */
export type HelpLadderLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const MAX_HELP_LADDER_LEVEL = 6 satisfies HelpLadderLevel;
/** Mức tiết lộ lời giải — chỉ được phép khi trẻ đã đạt số lần thử tối thiểu. */
export const SOLUTION_HELP_LADDER_LEVEL = 6 satisfies HelpLadderLevel;

export type InteractionSkillId =
  | 'WAIT_AND_INVITE'
  | 'LIMITED_CHOICE'
  | 'AGE_REPHRASE'
  | 'VISUAL_SCAFFOLD'
  | 'ASK_FOR_REASONING'
  | 'NORMALIZE_ERROR'
  | 'STRATEGY_SWITCH'
  | 'CREATIVE_DIVERGENCE'
  | 'BILINGUAL_BRIDGE'
  | 'BRAVE_STEP'
  | 'CALM_AND_RESET'
  | 'MOVE_OFF_SCREEN'
  | 'REFLECT_AND_CLOSE'
  | 'PARENT_HANDOFF';

export type FatigueAction =
  | 'CONTINUE'
  | 'SHORTEN_SESSION'
  | 'OFFLINE_MOVEMENT'
  | 'STOP_SESSION';

export type RepresentationAdaptation =
  | 'SWITCH_TO_CONCRETE_OR_VISUAL'
  | 'SIMPLIFY_LANGUAGE_KEEP_CONCEPT';

export type AudienceAdaptation = 'REDUCE_AUDIENCE_LEVEL_KEEP_REASONING';

/** Một lần luật kích hoạt — ghi vào bảng `rule_firing` để phụ huynh xem lại (minh bạch). */
export interface RuleFiring {
  ruleId: string;
  ruleVersion: string;
  /** Giải thích ngắn, ngôn ngữ phụ huynh. Không dùng thuật ngữ chẩn đoán. */
  parentExplanation: string;
  decision: string;
  inputsUsed: Record<string, string | number | boolean>;
}
