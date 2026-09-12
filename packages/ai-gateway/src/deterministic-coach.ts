import { checkCoachResponseInvariants, type CoachDirective, type SessionSnapshot } from '@tiny/domain';
import type { AiCoachResponse, AiProvider, CoachTurnInput, UnitHint } from './types.js';

/**
 * Coach tất định — KHÔNG gọi LLM. Chọn câu nói theo `directive` của rule engine
 * và `hints[]` của ContentPack. Dùng làm fallback (offline / AI lỗi) và là mặc định
 * ở Giai đoạn 1 (ADR 0002, AI_BEHAVIOR.md §1).
 *
 * Bất biến: không bao giờ vượt `directive.maxHelpLadderLevel`; PARENT_HANDOFF khi bắt buộc;
 * không tiết lộ lời giải (chỉ dùng nội dung hint đã duyệt, không sinh đáp án).
 */
export class DeterministicCoach implements AiProvider {
  readonly name = 'deterministic';

  async coachTurn(input: CoachTurnInput): Promise<AiCoachResponse> {
    return coachTurnSync(input);
  }
}

const HINT_TYPE_TO_INTENT: Record<UnitHint['type'], string> = {
  REPHRASE: 'REPHRASE_GOAL',
  QUESTION: 'ASK_SCAFFOLDING_QUESTION',
  VISUAL: 'OFFER_VISUAL_HINT',
  STRATEGY_CHOICE: 'OFFER_LIMITED_CHOICE',
  WORKED_EXAMPLE: 'ASK_FOR_REASONING',
};

const SKILL_TO_ACTION: Record<string, string> = {
  WAIT_AND_INVITE: 'WAIT',
  LIMITED_CHOICE: 'CHOOSE_STARTING_STRATEGY',
  AGE_REPHRASE: 'REPHRASE_GOAL',
  VISUAL_SCAFFOLD: 'OFFER_VISUAL_HINT',
  ASK_FOR_REASONING: 'EXPLAIN_THINKING',
  NORMALIZE_ERROR: 'TRY_AGAIN',
  STRATEGY_SWITCH: 'SWITCH_STRATEGY',
  CREATIVE_DIVERGENCE: 'ADD_ANOTHER_IDEA',
  BILINGUAL_BRIDGE: 'BRIDGE_LANGUAGE',
  BRAVE_STEP: 'TAKE_BRAVE_STEP',
  CALM_AND_RESET: 'PAUSE_AND_BREATHE',
  MOVE_OFF_SCREEN: 'DO_OFFLINE_ACTIVITY',
  REFLECT_AND_CLOSE: 'REFLECT',
  PARENT_HANDOFF: 'WAIT_FOR_PARENT',
};

function waitSecondsForAge(age: number): number {
  if (age <= 6) return 15;
  if (age <= 8) return 12;
  if (age <= 11) return 10;
  return 8;
}

function pickHint(hints: UnitHint[], level: number): UnitHint | null {
  const atOrBelow = hints
    .filter((h) => h.level <= level)
    .sort((a, b) => b.level - a.level);
  return atOrBelow[0] ?? hints.slice().sort((a, b) => a.level - b.level)[0] ?? null;
}

export function coachTurnSync(input: CoachTurnInput): AiCoachResponse {
  const { directive, unitHints, prompts, childAgeYears } = input;
  const wait = waitSecondsForAge(childAgeYears);
  const allowedActions = Array.from(
    new Set(directive.allowedInteractionSkills.map((s) => SKILL_TO_ACTION[s] ?? 'WAIT')),
  );

  const base = {
    hint_level: 0,
    wait_seconds: wait,
    allowed_next_actions: allowedActions.length ? allowedActions : ['WAIT'],
    safety_flag: null as string | null,
    parent_note: null as string | null,
  };

  let resp: AiCoachResponse;

  if (directive.mustHandoffToParent) {
    resp = {
      ...base,
      intent: 'PARENT_HANDOFF',
      child_message: 'Mình cùng hỏi ba/mẹ một chút nhé.',
      expected_action: 'WAIT_FOR_PARENT',
      allowed_next_actions: ['WAIT_FOR_PARENT'],
      safety_flag: 'NEEDS_PARENT',
      parent_note: 'Rule engine yêu cầu người lớn xem xét (ngoài phạm vi hoặc dấu hiệu căng thẳng).',
    };
  } else if (directive.fatigueAction === 'STOP_SESSION') {
    resp = {
      ...base,
      intent: 'REFLECT_AND_CLOSE',
      child_message: prompts.reflection_prompt ?? 'Hôm nay con thấy phần nào con tự làm được?',
      expected_action: 'REFLECT',
    };
  } else if (directive.fatigueAction === 'OFFLINE_MOVEMENT') {
    resp = {
      ...base,
      intent: 'MOVE_OFF_SCREEN',
      child_message: 'Mình đứng dậy vươn vai và đi lại một chút rồi quay lại nhé.',
      expected_action: 'DO_OFFLINE_ACTIVITY',
    };
  } else if (directive.recommendedHelpLadderLevel === 0) {
    resp = {
      ...base,
      intent: 'INVITE_TO_START',
      child_message: prompts.hook
        ? `${prompts.hook} Con thử bắt đầu theo cách con thích nhé.`
        : 'Con thử bắt đầu xem sao nhé. Mình chờ con.',
      expected_action: 'ATTEMPT',
    };
  } else {
    const level = Math.min(directive.recommendedHelpLadderLevel, directive.maxHelpLadderLevel);
    const hint = pickHint(unitHints, level);
    const intent = hint ? (HINT_TYPE_TO_INTENT[hint.type] ?? 'ASK_SCAFFOLDING_QUESTION') : 'REPHRASE_GOAL';
    resp = {
      ...base,
      intent,
      child_message:
        hint?.content ??
        prompts.plan_prompt ??
        'Con đang vướng ở bước nào? Con nói cho mình nghe thử.',
      hint_level: level,
      expected_action: intent === 'OFFER_LIMITED_CHOICE' ? 'CHOOSE_STARTING_STRATEGY' : 'TRY_AGAIN',
    };
  }

  // Kẹp cứng theo trần rule engine (phòng lỗi lập trình).
  resp.hint_level = Math.min(resp.hint_level, directive.maxHelpLadderLevel);
  return resp;
}

/**
 * Kiểm bất biến phản hồi coach so với directive (AI_BEHAVIOR.md §3 bước 6).
 * Dùng chung cho cả DeterministicCoach lẫn LLM sau này.
 */
export function assertCoachResponseValid(
  directive: CoachDirective,
  resp: AiCoachResponse,
  snapshot: SessionSnapshot,
): string[] {
  return checkCoachResponseInvariants(
    directive,
    {
      hintLevel: resp.hint_level,
      interactionSkill: mapIntentToSkill(resp.intent),
      revealsSolution: false, // DeterministicCoach không sinh lời giải
    },
    snapshot,
  );
}

function mapIntentToSkill(intent: string): string {
  const m: Record<string, string> = {
    INVITE_TO_START: 'WAIT_AND_INVITE',
    ASK_SCAFFOLDING_QUESTION: 'ASK_FOR_REASONING',
    OFFER_LIMITED_CHOICE: 'LIMITED_CHOICE',
    REPHRASE_GOAL: 'AGE_REPHRASE',
    OFFER_VISUAL_HINT: 'VISUAL_SCAFFOLD',
    ASK_FOR_REASONING: 'ASK_FOR_REASONING',
    NORMALIZE_ERROR: 'NORMALIZE_ERROR',
    SUGGEST_STRATEGY_SWITCH: 'STRATEGY_SWITCH',
    ENCOURAGE_CREATIVE_DIVERGENCE: 'CREATIVE_DIVERGENCE',
    BILINGUAL_BRIDGE: 'BILINGUAL_BRIDGE',
    GUIDE_BRAVE_STEP: 'BRAVE_STEP',
    CALM_AND_RESET: 'CALM_AND_RESET',
    MOVE_OFF_SCREEN: 'MOVE_OFF_SCREEN',
    REFLECT_AND_CLOSE: 'REFLECT_AND_CLOSE',
    PARENT_HANDOFF: 'PARENT_HANDOFF',
  };
  return m[intent] ?? 'AGE_REPHRASE';
}
