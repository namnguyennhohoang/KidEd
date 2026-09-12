import { describe, it, expect } from 'vitest';
import { evaluate, defaultSnapshot, type SessionSnapshot } from '@tiny/domain';
import { coachTurnSync, assertCoachResponseValid } from './index.js';
import type { CoachTurnInput, UnitHint } from './index.js';

const HINTS: UnitHint[] = [
  { level: 1, type: 'REPHRASE', content: 'Mình cần chia 10 chú chim thành hai nhóm.' },
  { level: 2, type: 'QUESTION', content: 'Con muốn đặt một chú chim vào nhà nào trước?' },
  { level: 3, type: 'VISUAL', content_ref: 'ref' },
];

function turn(over: Partial<SessionSnapshot> = {}): CoachTurnInput {
  const snapshot = defaultSnapshot(over);
  return {
    directive: evaluate(snapshot),
    unitHints: HINTS,
    prompts: { hook: 'Có 10 chú chim.', plan_prompt: 'Con bắt đầu thế nào?', reflection_prompt: 'Con làm được gì?' },
    childRequestedHelp: over.childRequestedHelp ?? false,
    childAgeYears: over.childAgeYears ?? 6,
  };
}

describe('DeterministicCoach', () => {
  it('trong thời gian chờ, chưa xin trợ giúp -> INVITE_TO_START, hint_level 0', () => {
    const input = turn({ secondsSincePrompt: 3, configuredWaitSeconds: 12 });
    const r = coachTurnSync(input);
    expect(r.intent).toBe('INVITE_TO_START');
    expect(r.hint_level).toBe(0);
    expect(assertCoachResponseValid(input.directive, r, defaultSnapshot({ secondsSincePrompt: 3 }))).toEqual([]);
  });

  it('xin trợ giúp sau thời gian chờ -> dùng nội dung hint đã duyệt, không vượt trần', () => {
    const snap: Partial<SessionSnapshot> = {
      attemptsMade: 2,
      childRequestedHelp: true,
      secondsSincePrompt: 30,
      currentHelpLadderLevel: 0,
    };
    const input = turn(snap);
    const r = coachTurnSync(input);
    expect(r.hint_level).toBeGreaterThanOrEqual(1);
    expect(r.hint_level).toBeLessThanOrEqual(input.directive.maxHelpLadderLevel);
    expect(r.child_message.length).toBeGreaterThan(0);
    expect(assertCoachResponseValid(input.directive, r, defaultSnapshot(snap))).toEqual([]);
  });

  it('chưa đủ số lần thử -> hint_level không chạm mức tiết lộ lời giải (6)', () => {
    const snap: Partial<SessionSnapshot> = {
      attemptsMade: 0,
      minimumAttemptsBeforeSolution: 2,
      childRequestedHelp: true,
      secondsSincePrompt: 30,
      currentHelpLadderLevel: 5,
    };
    const input = turn(snap);
    const r = coachTurnSync(input);
    expect(r.hint_level).toBeLessThanOrEqual(5);
    expect(assertCoachResponseValid(input.directive, r, defaultSnapshot(snap))).toEqual([]);
  });

  it('ngoài phạm vi -> PARENT_HANDOFF + safety_flag', () => {
    const snap = { outOfScopeRequest: true };
    const input = turn(snap);
    const r = coachTurnSync(input);
    expect(r.intent).toBe('PARENT_HANDOFF');
    expect(r.safety_flag).toBe('NEEDS_PARENT');
    expect(assertCoachResponseValid(input.directive, r, defaultSnapshot(snap))).toEqual([]);
  });

  it('quá tải -> MOVE_OFF_SCREEN', () => {
    const input = turn({
      fatigue: {
        sessionMinutes: 5,
        configuredSessionMinutesCap: 10,
        overloadObserved: true,
        distressObserved: false,
      },
    });
    const r = coachTurnSync(input);
    expect(r.intent).toBe('MOVE_OFF_SCREEN');
  });

  it('distress -> REFLECT_AND_CLOSE hoặc PARENT_HANDOFF (không dẫn dắt tiếp)', () => {
    const input = turn({
      fatigue: {
        sessionMinutes: 5,
        configuredSessionMinutesCap: 10,
        overloadObserved: false,
        distressObserved: true,
      },
    });
    const r = coachTurnSync(input);
    expect(['PARENT_HANDOFF', 'REFLECT_AND_CLOSE']).toContain(r.intent);
  });

  it('wait_seconds tăng theo tuổi nhỏ', () => {
    expect(coachTurnSync(turn({ childAgeYears: 6 })).wait_seconds).toBeGreaterThan(
      coachTurnSync(turn({ childAgeYears: 12 })).wait_seconds,
    );
  });
});
