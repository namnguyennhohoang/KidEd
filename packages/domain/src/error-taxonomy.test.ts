import { describe, it, expect } from 'vitest';
import { ERROR_CAUSES, ERROR_CAUSE_VI, isErrorCause, suggestCauses } from './error-taxonomy.js';

describe('error taxonomy', () => {
  it('có đủ 9 nguyên nhân và bản dịch', () => {
    expect(ERROR_CAUSES).toHaveLength(9);
    for (const c of ERROR_CAUSES) expect(ERROR_CAUSE_VI[c]).toBeTruthy();
  });

  it('isErrorCause', () => {
    expect(isErrorCause('MISCONCEPTION')).toBe(true);
    expect(isErrorCause('nope')).toBe(false);
  });

  it('suggestCauses — advisory từ tín hiệu', () => {
    expect(
      suggestCauses({
        repeatedErrors: true,
        languageLoadHigh: true,
        representationIsAbstract: false,
        hintsRequested: 0,
        attemptsBeforeFirstHint: 0,
        timePressure: false,
        explanationMissing: false,
      }),
    ).toEqual(expect.arrayContaining(['QUESTION_LANGUAGE', 'NO_STRATEGY']));

    expect(
      suggestCauses({
        repeatedErrors: false,
        languageLoadHigh: false,
        representationIsAbstract: false,
        hintsRequested: 4,
        attemptsBeforeFirstHint: 0,
        timePressure: true,
        explanationMissing: true,
      }),
    ).toEqual(expect.arrayContaining(['HINT_DEPENDENCE', 'TIME_PRESSURE', 'CANT_EXPLAIN']));

    expect(
      suggestCauses({
        repeatedErrors: false,
        languageLoadHigh: false,
        representationIsAbstract: false,
        hintsRequested: 1,
        attemptsBeforeFirstHint: 2,
        timePressure: false,
        explanationMissing: false,
      }),
    ).toEqual([]);
  });
});
