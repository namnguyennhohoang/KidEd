import type {
  AudienceAdaptation,
  FatigueAction,
  HelpLadderLevel,
  InteractionSkillId,
  RepresentationAdaptation,
  RuleFiring,
  Stage,
} from '../types.js';
import { decideHelpLadder } from './help-ladder.js';
import { decideFatigue } from './fatigue.js';
import { decideAdaptations } from './adaptations.js';
import type { SessionSnapshot } from './snapshot.js';

export * from './snapshot.js';
export { decideHelpLadder } from './help-ladder.js';
export { decideFatigue } from './fatigue.js';
export { decideAdaptations } from './adaptations.js';

/**
 * Chỉ thị cho AI Orchestrator / Coach. Rule engine QUYẾT ĐỊNH, LLM chỉ diễn đạt
 * trong giới hạn này (ADR 0002). `allowedInteractionSkills` là allowlist tuyệt đối.
 */
export interface CoachDirective {
  maxHelpLadderLevel: HelpLadderLevel;
  recommendedHelpLadderLevel: HelpLadderLevel;
  mustHandoffToParent: boolean;
  fatigueAction: FatigueAction;
  representationAdaptation: RepresentationAdaptation | null;
  audienceAdaptation: AudienceAdaptation | null;
  allowedInteractionSkills: InteractionSkillId[];
  firings: RuleFiring[];
}

const STAGE_SKILL_ALLOWLIST: Record<Stage, InteractionSkillId[]> = {
  BASE_CAMP: [
    'WAIT_AND_INVITE',
    'LIMITED_CHOICE',
    'AGE_REPHRASE',
    'VISUAL_SCAFFOLD',
    'ASK_FOR_REASONING',
    'NORMALIZE_ERROR',
    'CREATIVE_DIVERGENCE',
    'BILINGUAL_BRIDGE',
    'BRAVE_STEP',
    'CALM_AND_RESET',
    'MOVE_OFF_SCREEN',
    'REFLECT_AND_CLOSE',
    'PARENT_HANDOFF',
  ],
  EXPLORER: [
    'WAIT_AND_INVITE',
    'LIMITED_CHOICE',
    'AGE_REPHRASE',
    'VISUAL_SCAFFOLD',
    'ASK_FOR_REASONING',
    'NORMALIZE_ERROR',
    'STRATEGY_SWITCH',
    'CREATIVE_DIVERGENCE',
    'BILINGUAL_BRIDGE',
    'BRAVE_STEP',
    'CALM_AND_RESET',
    'MOVE_OFF_SCREEN',
    'REFLECT_AND_CLOSE',
    'PARENT_HANDOFF',
  ],
  TDN_READINESS: [
    'WAIT_AND_INVITE',
    'LIMITED_CHOICE',
    'AGE_REPHRASE',
    'VISUAL_SCAFFOLD',
    'ASK_FOR_REASONING',
    'NORMALIZE_ERROR',
    'STRATEGY_SWITCH',
    'CREATIVE_DIVERGENCE',
    'BILINGUAL_BRIDGE',
    'BRAVE_STEP',
    'CALM_AND_RESET',
    'MOVE_OFF_SCREEN',
    'REFLECT_AND_CLOSE',
    'PARENT_HANDOFF',
  ],
  SPECIALISATION: [
    'WAIT_AND_INVITE',
    'AGE_REPHRASE',
    'ASK_FOR_REASONING',
    'NORMALIZE_ERROR',
    'STRATEGY_SWITCH',
    'CREATIVE_DIVERGENCE',
    'BILINGUAL_BRIDGE',
    'CALM_AND_RESET',
    'MOVE_OFF_SCREEN',
    'REFLECT_AND_CLOSE',
    'PARENT_HANDOFF',
  ],
  SPEC_HS_READINESS: [
    'WAIT_AND_INVITE',
    'AGE_REPHRASE',
    'ASK_FOR_REASONING',
    'NORMALIZE_ERROR',
    'STRATEGY_SWITCH',
    'CREATIVE_DIVERGENCE',
    'BILINGUAL_BRIDGE',
    'CALM_AND_RESET',
    'MOVE_OFF_SCREEN',
    'REFLECT_AND_CLOSE',
    'PARENT_HANDOFF',
  ],
  GLOBAL_SCHOLAR: [
    'WAIT_AND_INVITE',
    'ASK_FOR_REASONING',
    'NORMALIZE_ERROR',
    'STRATEGY_SWITCH',
    'CREATIVE_DIVERGENCE',
    'BILINGUAL_BRIDGE',
    'CALM_AND_RESET',
    'REFLECT_AND_CLOSE',
    'PARENT_HANDOFF',
  ],
};

/** Rule engine chính. Thuần, không side effect — dễ test và chạy được ở client (offline). */
export function evaluate(s: SessionSnapshot): CoachDirective {
  const help = decideHelpLadder(s);
  const fatigue = decideFatigue(s);
  const adapt = decideAdaptations(s);

  const firings: RuleFiring[] = [...help.firings, ...fatigue.firings, ...adapt.firings];

  const mustHandoffToParent = fatigue.handoffToParent || s.outOfScopeRequest;
  if (s.outOfScopeRequest && !fatigue.handoffToParent) {
    firings.push({
      ruleId: 'R-OR-1',
      ruleVersion: '1.0.0',
      parentExplanation: 'Bé hỏi một điều ngoài nội dung đã chuẩn bị, hệ thống chuyển câu hỏi cho ba/mẹ.',
      decision: 'handoff_out_of_scope',
      inputsUsed: { outOfScopeRequest: true },
    });
  }

  const stageAllowed = STAGE_SKILL_ALLOWLIST[s.stage];
  let allowedInteractionSkills: InteractionSkillId[];

  if (mustHandoffToParent) {
    allowedInteractionSkills = ['PARENT_HANDOFF'];
  } else if (fatigue.action === 'STOP_SESSION') {
    allowedInteractionSkills = intersect(['REFLECT_AND_CLOSE', 'CALM_AND_RESET'], stageAllowed);
  } else if (fatigue.action === 'OFFLINE_MOVEMENT') {
    allowedInteractionSkills = intersect(['MOVE_OFF_SCREEN', 'CALM_AND_RESET'], stageAllowed);
  } else if (fatigue.action === 'SHORTEN_SESSION') {
    allowedInteractionSkills = intersect(
      ['REFLECT_AND_CLOSE', 'MOVE_OFF_SCREEN', 'AGE_REPHRASE'],
      stageAllowed,
    );
  } else if (help.recommendedLevel === 0) {
    allowedInteractionSkills = intersect(['WAIT_AND_INVITE'], stageAllowed);
  } else {
    const base: InteractionSkillId[] = ['AGE_REPHRASE', 'ASK_FOR_REASONING', 'NORMALIZE_ERROR'];
    if (help.maxLevel >= 3) base.push('VISUAL_SCAFFOLD', 'LIMITED_CHOICE');
    if (help.maxLevel >= 4) base.push('STRATEGY_SWITCH');
    if (adapt.representation === 'SWITCH_TO_CONCRETE_OR_VISUAL') base.push('VISUAL_SCAFFOLD');
    if (s.presentationAnxietyObserved) base.push('BRAVE_STEP');
    allowedInteractionSkills = intersect(unique(base), stageAllowed);
  }

  return {
    maxHelpLadderLevel: help.maxLevel,
    recommendedHelpLadderLevel: help.recommendedLevel,
    mustHandoffToParent,
    fatigueAction: fatigue.action,
    representationAdaptation: adapt.representation,
    audienceAdaptation: adapt.audience,
    allowedInteractionSkills,
    firings,
  };
}

/**
 * Kiểm bất biến trên phản hồi của LLM sau khi nhận (AI_BEHAVIOR.md §3 bước 6).
 * Trả danh sách vi phạm; rỗng = hợp lệ.
 */
export function checkCoachResponseInvariants(
  directive: CoachDirective,
  response: { hintLevel: number; interactionSkill: string; revealsSolution: boolean },
  snapshot: SessionSnapshot,
): string[] {
  const violations: string[] = [];

  if (response.hintLevel > directive.maxHelpLadderLevel) {
    violations.push(
      `hint_level ${response.hintLevel} vượt trần ${directive.maxHelpLadderLevel}`,
    );
  }
  if (!directive.allowedInteractionSkills.includes(response.interactionSkill as InteractionSkillId)) {
    violations.push(`interaction_skill "${response.interactionSkill}" ngoài allowlist`);
  }
  if (
    response.revealsSolution &&
    snapshot.attemptsMade < snapshot.minimumAttemptsBeforeSolution
  ) {
    violations.push('tiết lộ lời giải trước khi trẻ đạt số lần thử tối thiểu');
  }
  if (directive.mustHandoffToParent && response.interactionSkill !== 'PARENT_HANDOFF') {
    violations.push('cần PARENT_HANDOFF nhưng phản hồi không phải PARENT_HANDOFF');
  }

  return violations;
}

function intersect<T>(a: T[], b: T[]): T[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}
function unique<T>(a: T[]): T[] {
  return [...new Set(a)];
}
