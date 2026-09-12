import type { AudienceAdaptation, RepresentationAdaptation, RuleFiring } from '../types.js';
import type { SessionSnapshot } from './snapshot.js';

export interface AdaptationDecision {
  representation: RepresentationAdaptation | null;
  audience: AudienceAdaptation | null;
  firings: RuleFiring[];
}

/**
 * Điều chỉnh cách trình bày mà KHÔNG hạ độ khó tư duy cốt lõi (AI_BEHAVIOR.md §5).
 */
export function decideAdaptations(s: SessionSnapshot): AdaptationDecision {
  const firings: RuleFiring[] = [];
  let representation: RepresentationAdaptation | null = null;
  let audience: AudienceAdaptation | null = null;

  // R-AD-1: lỗi lặp lại + tải ngôn ngữ cao -> đơn giản hóa NGÔN NGỮ, giữ khái niệm.
  if (s.repeatedErrors && s.languageLoadHigh) {
    representation = 'SIMPLIFY_LANGUAGE_KEEP_CONCEPT';
    firings.push({
      ruleId: 'R-AD-1',
      ruleVersion: '1.0.0',
      parentExplanation: 'Câu hỏi đang hơi khó đọc với bé, hệ thống diễn đạt lại đơn giản hơn nhưng giữ nguyên bài.',
      decision: 'SIMPLIFY_LANGUAGE_KEEP_CONCEPT',
      inputsUsed: { repeatedErrors: true, languageLoadHigh: true },
    });
  } else if (s.repeatedErrors && s.representationIsAbstract) {
    // R-AD-2: lỗi lặp lại + biểu diễn trừu tượng -> chuyển sang cụ thể/hình ảnh.
    representation = 'SWITCH_TO_CONCRETE_OR_VISUAL';
    firings.push({
      ruleId: 'R-AD-2',
      ruleVersion: '1.0.0',
      parentExplanation: 'Bé đang vướng ở phần trừu tượng, hệ thống chuyển sang dùng hình ảnh hoặc vật thật.',
      decision: 'SWITCH_TO_CONCRETE_OR_VISUAL',
      inputsUsed: { repeatedErrors: true, representationIsAbstract: true },
    });
  }

  // R-AD-3: lo lắng khi trình bày -> giảm mức khán giả, GIỮ độ khó lập luận.
  if (s.presentationAnxietyObserved) {
    audience = 'REDUCE_AUDIENCE_LEVEL_KEEP_REASONING';
    firings.push({
      ruleId: 'R-AD-3',
      ruleVersion: '1.0.0',
      parentExplanation:
        'Bé thấy ngại khi trình bày, hệ thống cho bé nói với ít người hơn trước, phần suy nghĩ vẫn giữ nguyên.',
      decision: 'REDUCE_AUDIENCE_LEVEL_KEEP_REASONING',
      inputsUsed: { presentationAnxietyObserved: true },
    });
  }

  return { representation, audience, firings };
}
