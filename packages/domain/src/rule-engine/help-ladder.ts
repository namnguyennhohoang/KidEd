import {
  MAX_HELP_LADDER_LEVEL,
  SOLUTION_HELP_LADDER_LEVEL,
  type HelpLadderLevel,
  type RuleFiring,
} from '../types.js';
import type { SessionSnapshot } from './snapshot.js';

const clamp = (n: number): HelpLadderLevel =>
  Math.max(0, Math.min(MAX_HELP_LADDER_LEVEL, Math.round(n))) as HelpLadderLevel;

export interface HelpLadderDecision {
  /** Trần thang trợ giúp lượt này — AI/người lớn KHÔNG được vượt. */
  maxLevel: HelpLadderLevel;
  /** Mức nên dùng lượt này. */
  recommendedLevel: HelpLadderLevel;
  firings: RuleFiring[];
}

/**
 * Quyết định thang trợ giúp (PEDAGOGY.md §2, ADR 0002).
 *
 * Bất biến:
 * - Không tiết lộ lời giải (level 6) trước khi trẻ đạt số lần thử tối thiểu.
 * - Không leo thang chỉ vì trẻ im lặng vài giây (còn trong thời gian chờ).
 * - Không nhảy quá +1 mức mỗi lượt (gradual release).
 * - Fade scaffolding khi mastery cao + độc lập thấp, hoặc có chuỗi độc lập.
 */
export function decideHelpLadder(s: SessionSnapshot): HelpLadderDecision {
  const firings: RuleFiring[] = [];
  let maxLevel: HelpLadderLevel = MAX_HELP_LADDER_LEVEL;

  // R-HL-1: chưa đủ số lần thử -> không cho tới mức tiết lộ lời giải.
  if (s.attemptsMade < s.minimumAttemptsBeforeSolution) {
    maxLevel = clamp(SOLUTION_HELP_LADDER_LEVEL - 1);
    firings.push({
      ruleId: 'R-HL-1',
      ruleVersion: '1.0.0',
      parentExplanation:
        'Bé chưa thử đủ số lần trước khi được xem lời giải, nên hệ thống chỉ gợi ý chứ chưa đưa đáp án.',
      decision: `cap_max_level=${maxLevel}`,
      inputsUsed: {
        attemptsMade: s.attemptsMade,
        minimumAttemptsBeforeSolution: s.minimumAttemptsBeforeSolution,
      },
    });
  }

  // R-HL-2: fade scaffolding khi mastery cao nhưng độc lập thấp.
  if (s.masteryLevel === 'HIGH' && s.independenceLevel === 'LOW') {
    maxLevel = clamp(Math.min(maxLevel, MAX_HELP_LADDER_LEVEL - 1));
    firings.push({
      ruleId: 'R-HL-2',
      ruleVersion: '1.0.0',
      parentExplanation:
        'Bé đã nắm nội dung nhưng hay chờ trợ giúp, nên hệ thống giảm bớt gợi ý để bé tự làm nhiều hơn.',
      decision: `fade_scaffolding max_level=${maxLevel}`,
      inputsUsed: { masteryLevel: s.masteryLevel, independenceLevel: s.independenceLevel },
    });
  }

  // R-HL-3: có chuỗi hoàn thành độc lập -> gỡ một lớp hint.
  if (s.consecutiveIndependentSuccesses >= s.independentSuccessThreshold) {
    maxLevel = clamp(maxLevel - 1);
    firings.push({
      ruleId: 'R-HL-3',
      ruleVersion: '1.0.0',
      parentExplanation:
        `Bé đã tự hoàn thành ${s.consecutiveIndependentSuccesses} nhiệm vụ liên tiếp, hệ thống gỡ bớt một lớp gợi ý.`,
      decision: `remove_one_hint_layer max_level=${maxLevel}`,
      inputsUsed: {
        consecutiveIndependentSuccesses: s.consecutiveIndependentSuccesses,
        independentSuccessThreshold: s.independentSuccessThreshold,
      },
    });
  }

  // R-HL-4: còn trong thời gian chờ và trẻ không xin trợ giúp -> không leo thang.
  const withinWait = s.secondsSincePrompt < s.configuredWaitSeconds;
  if (withinWait && !s.childRequestedHelp) {
    maxLevel = clamp(Math.min(maxLevel, Math.max(s.currentHelpLadderLevel, 1)));
    firings.push({
      ruleId: 'R-HL-4',
      ruleVersion: '1.0.0',
      parentExplanation:
        'Bé mới im lặng vài giây và chưa xin trợ giúp, nên hệ thống chờ thêm chứ không tăng mức gợi ý.',
      decision: `hold_level max_level=${maxLevel}`,
      inputsUsed: {
        secondsSincePrompt: s.secondsSincePrompt,
        configuredWaitSeconds: s.configuredWaitSeconds,
        childRequestedHelp: s.childRequestedHelp,
      },
    });
  }

  // Mức khuyến nghị: gradual (không nhảy quá +1), tôn trọng trần.
  let recommendedLevel: HelpLadderLevel;
  if (withinWait && !s.childRequestedHelp) {
    recommendedLevel = 0; // WAIT
  } else if (s.childRequestedHelp) {
    recommendedLevel = clamp(Math.min(s.currentHelpLadderLevel + 1, maxLevel));
    if (recommendedLevel < 1) recommendedLevel = clamp(Math.min(1, maxLevel));
  } else {
    recommendedLevel = clamp(Math.min(s.currentHelpLadderLevel, maxLevel));
  }

  return { maxLevel, recommendedLevel, firings };
}
