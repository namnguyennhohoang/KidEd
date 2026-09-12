import { describe, it, expect } from 'vitest';
import { evaluate, checkCoachResponseInvariants, defaultSnapshot } from './index.js';

describe('help ladder — bất biến sư phạm', () => {
  it('chưa đủ số lần thử: không cho tới mức tiết lộ lời giải (6)', () => {
    const d = evaluate(
      defaultSnapshot({
        attemptsMade: 0,
        minimumAttemptsBeforeSolution: 1,
        childRequestedHelp: true,
        secondsSincePrompt: 60,
      }),
    );
    expect(d.maxHelpLadderLevel).toBeLessThanOrEqual(5);
    expect(d.firings.some((f) => f.ruleId === 'R-HL-1')).toBe(true);
  });

  it('đã đủ số lần thử: cho phép tới mức 6', () => {
    const d = evaluate(
      defaultSnapshot({
        attemptsMade: 2,
        minimumAttemptsBeforeSolution: 1,
        childRequestedHelp: true,
        currentHelpLadderLevel: 5,
        secondsSincePrompt: 60,
      }),
    );
    expect(d.maxHelpLadderLevel).toBe(6);
  });

  it('im lặng vài giây, không xin trợ giúp: không leo thang, khuyến nghị WAIT', () => {
    const d = evaluate(
      defaultSnapshot({
        currentHelpLadderLevel: 1,
        childRequestedHelp: false,
        secondsSincePrompt: 3,
        configuredWaitSeconds: 12,
      }),
    );
    expect(d.recommendedHelpLadderLevel).toBe(0);
    expect(d.allowedInteractionSkills).toEqual(['WAIT_AND_INVITE']);
    expect(d.firings.some((f) => f.ruleId === 'R-HL-4')).toBe(true);
  });

  it('xin trợ giúp sau thời gian chờ: tăng tối đa +1 mức', () => {
    const d = evaluate(
      defaultSnapshot({
        attemptsMade: 3,
        currentHelpLadderLevel: 2,
        childRequestedHelp: true,
        secondsSincePrompt: 30,
      }),
    );
    expect(d.recommendedHelpLadderLevel).toBe(3);
  });

  it('mastery cao + độc lập thấp: fade scaffolding (trần < 6)', () => {
    const d = evaluate(
      defaultSnapshot({
        attemptsMade: 3,
        masteryLevel: 'HIGH',
        independenceLevel: 'LOW',
        childRequestedHelp: true,
        secondsSincePrompt: 30,
      }),
    );
    expect(d.maxHelpLadderLevel).toBeLessThanOrEqual(5);
    expect(d.firings.some((f) => f.ruleId === 'R-HL-2')).toBe(true);
  });

  it('chuỗi hoàn thành độc lập >= ngưỡng: gỡ một lớp hint', () => {
    const withStreak = evaluate(
      defaultSnapshot({
        attemptsMade: 3,
        consecutiveIndependentSuccesses: 3,
        independentSuccessThreshold: 3,
        childRequestedHelp: true,
        secondsSincePrompt: 30,
      }),
    );
    const noStreak = evaluate(
      defaultSnapshot({
        attemptsMade: 3,
        consecutiveIndependentSuccesses: 0,
        childRequestedHelp: true,
        secondsSincePrompt: 30,
      }),
    );
    expect(withStreak.maxHelpLadderLevel).toBeLessThan(noStreak.maxHelpLadderLevel);
    expect(withStreak.firings.some((f) => f.ruleId === 'R-HL-3')).toBe(true);
  });
});

describe('fatigue — bảo vệ sức khỏe học tập', () => {
  it('distress: dừng phiên + chuyển phụ huynh', () => {
    const d = evaluate(defaultSnapshot({ fatigue: { ...base(), distressObserved: true } }));
    expect(d.fatigueAction).toBe('STOP_SESSION');
    expect(d.mustHandoffToParent).toBe(true);
    expect(d.allowedInteractionSkills).toEqual(['PARENT_HANDOFF']);
  });

  it('quá tải: chuyển hoạt động ngoài màn hình', () => {
    const d = evaluate(defaultSnapshot({ fatigue: { ...base(), overloadObserved: true } }));
    expect(d.fatigueAction).toBe('OFFLINE_MOVEMENT');
    expect(d.allowedInteractionSkills).toContain('MOVE_OFF_SCREEN');
  });

  it('đạt trần thời gian phiên: rút ngắn', () => {
    const d = evaluate(
      defaultSnapshot({ fatigue: { ...base(), sessionMinutes: 12, configuredSessionMinutesCap: 10 } }),
    );
    expect(d.fatigueAction).toBe('SHORTEN_SESSION');
  });
});

describe('adaptations — giữ độ khó tư duy', () => {
  it('lỗi lặp + tải ngôn ngữ cao: đơn giản hóa ngôn ngữ, giữ khái niệm', () => {
    const d = evaluate(defaultSnapshot({ repeatedErrors: true, languageLoadHigh: true }));
    expect(d.representationAdaptation).toBe('SIMPLIFY_LANGUAGE_KEEP_CONCEPT');
  });

  it('lỗi lặp + biểu diễn trừu tượng: chuyển sang cụ thể/hình ảnh', () => {
    const d = evaluate(defaultSnapshot({ repeatedErrors: true, representationIsAbstract: true }));
    expect(d.representationAdaptation).toBe('SWITCH_TO_CONCRETE_OR_VISUAL');
  });

  it('lo lắng khi trình bày: giảm khán giả, giữ lập luận', () => {
    const d = evaluate(defaultSnapshot({ presentationAnxietyObserved: true }));
    expect(d.audienceAdaptation).toBe('REDUCE_AUDIENCE_LEVEL_KEEP_REASONING');
  });
});

describe('allowlist + kiểm bất biến phản hồi LLM', () => {
  it('mọi interaction skill khuyến nghị đều nằm trong allowlist của stage', () => {
    const d = evaluate(defaultSnapshot({ attemptsMade: 3, childRequestedHelp: true, secondsSincePrompt: 30 }));
    expect(d.allowedInteractionSkills.length).toBeGreaterThan(0);
  });

  it('phát hiện LLM vượt trần thang trợ giúp', () => {
    const s = defaultSnapshot({ attemptsMade: 0, minimumAttemptsBeforeSolution: 2 });
    const d = evaluate(s);
    const v = checkCoachResponseInvariants(
      d,
      { hintLevel: 6, interactionSkill: 'AGE_REPHRASE', revealsSolution: true },
      s,
    );
    expect(v.length).toBeGreaterThanOrEqual(2);
    expect(v.some((m) => m.includes('vượt trần'))).toBe(true);
    expect(v.some((m) => m.includes('tiết lộ lời giải'))).toBe(true);
  });

  it('phát hiện LLM không PARENT_HANDOFF khi bắt buộc', () => {
    const s = defaultSnapshot({ outOfScopeRequest: true });
    const d = evaluate(s);
    const v = checkCoachResponseInvariants(
      d,
      { hintLevel: 1, interactionSkill: 'AGE_REPHRASE', revealsSolution: false },
      s,
    );
    expect(v.some((m) => m.includes('PARENT_HANDOFF'))).toBe(true);
  });

  it('phản hồi hợp lệ: không vi phạm', () => {
    const s = defaultSnapshot({ attemptsMade: 3, childRequestedHelp: true, secondsSincePrompt: 30 });
    const d = evaluate(s);
    const skill = d.allowedInteractionSkills[0]!;
    const v = checkCoachResponseInvariants(
      d,
      { hintLevel: d.recommendedHelpLadderLevel, interactionSkill: skill, revealsSolution: false },
      s,
    );
    expect(v).toEqual([]);
  });
});

function base() {
  return {
    sessionMinutes: 0,
    configuredSessionMinutesCap: 10,
    overloadObserved: false,
    distressObserved: false,
  };
}
