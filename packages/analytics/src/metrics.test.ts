import { describe, it, expect } from 'vitest';
import {
  initiationLatencySeconds,
  medianHintLevel,
  attemptsBeforeHelp,
  strategyCount,
  independentCompletionRate,
  screenToOfflineRatio,
} from './index.js';
import type { SessionEvent } from './index.js';

const ev = (type: SessionEvent['type'], secondsFromEpoch: number): SessionEvent => ({
  type,
  sessionId: 's1',
  occurredAt: new Date(secondsFromEpoch * 1000).toISOString(),
  clientGeneratedId: `${type}-${secondsFromEpoch}`,
  source: 'CHILD_APP',
});

describe('initiationLatencySeconds', () => {
  it('tính khoảng cách SESSION_STARTED -> FIRST_ACTION', () => {
    expect(initiationLatencySeconds([ev('SESSION_STARTED', 100), ev('FIRST_ACTION', 118)])).toBe(18);
  });
  it('thiếu mốc -> null', () => {
    expect(initiationLatencySeconds([ev('SESSION_STARTED', 100)])).toBeNull();
  });
});

describe('medianHintLevel', () => {
  it('lẻ phần tử', () => {
    expect(
      medianHintLevel([h(1), h(3), h(2)]),
    ).toBe(2);
  });
  it('chẵn phần tử -> trung bình 2 giá trị giữa', () => {
    expect(medianHintLevel([h(1), h(2), h(3), h(4)])).toBe(2.5);
  });
  it('không có hint -> null', () => {
    expect(medianHintLevel([])).toBeNull();
  });
});

describe('attemptsBeforeHelp', () => {
  it('đếm ATTEMPT_SUBMITTED trước HINT_REQUESTED đầu tiên', () => {
    expect(
      attemptsBeforeHelp([
        ev('ATTEMPT_SUBMITTED', 1),
        ev('ATTEMPT_SUBMITTED', 2),
        ev('HINT_REQUESTED', 3),
        ev('ATTEMPT_SUBMITTED', 4),
      ]),
    ).toBe(2);
  });
  it('không xin trợ giúp -> tổng số lần thử', () => {
    expect(attemptsBeforeHelp([ev('ATTEMPT_SUBMITTED', 1), ev('ATTEMPT_SUBMITTED', 2)])).toBe(2);
  });
});

describe('strategyCount', () => {
  it('số STRATEGY_CHANGED + 1 khi có hành động', () => {
    expect(strategyCount([ev('FIRST_ACTION', 1), ev('STRATEGY_CHANGED', 2)])).toBe(2);
  });
  it('không có hành động -> 0', () => {
    expect(strategyCount([ev('SESSION_STARTED', 1)])).toBe(0);
  });
});

describe('independentCompletionRate', () => {
  it('phiên hoàn thành 0 hint / tổng phiên hoàn thành', () => {
    expect(
      independentCompletionRate([
        { sessionId: 'a', completed: true, hintCount: 0 },
        { sessionId: 'b', completed: true, hintCount: 2 },
        { sessionId: 'c', completed: false, hintCount: 0 },
      ]),
    ).toBe(0.5);
  });
  it('chưa phiên nào hoàn thành -> null', () => {
    expect(independentCompletionRate([{ sessionId: 'a', completed: false, hintCount: 0 }])).toBeNull();
  });
});

describe('screenToOfflineRatio', () => {
  it('offline/screen', () => {
    expect(screenToOfflineRatio(5, 15)).toBe(3);
  });
  it('screen <= 0 -> null', () => {
    expect(screenToOfflineRatio(0, 10)).toBeNull();
  });
});

function h(level: number) {
  return { sessionId: 's1', helpLadderLevel: level, requestedAt: new Date().toISOString() };
}
