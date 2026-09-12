import type { SessionSnapshot, HelpLadderLevel } from '@tiny/domain';

export interface SnapshotSources {
  childBirthYear: number;
  childBirthMonth: number;
  stage: string;
  taskType: string;
  attemptsMade: number;
  minimumAttemptsBeforeSolution: number;
  currentHelpLadderLevel: number;
  sessionStartedAt: Date;
  configuredSessionMinutesCap: number;
  /** Tín hiệu do client gửi kèm yêu cầu hint (không bắt buộc). */
  signals?: {
    childRequestedHelp?: boolean | undefined;
    secondsSincePrompt?: number | undefined;
    configuredWaitSeconds?: number | undefined;
    repeatedErrors?: boolean | undefined;
    languageLoadHigh?: boolean | undefined;
    representationIsAbstract?: boolean | undefined;
    presentationAnxietyObserved?: boolean | undefined;
    overloadObserved?: boolean | undefined;
    distressObserved?: boolean | undefined;
    outOfScopeRequest?: boolean | undefined;
  };
}

function ageYears(birthYear: number, birthMonth: number, now = new Date()): number {
  let age = now.getUTCFullYear() - birthYear;
  if (now.getUTCMonth() + 1 < birthMonth) age -= 1;
  return Math.max(3, Math.min(18, age));
}

/**
 * Dựng SessionSnapshot cho rule engine. Slice 3: independence/mastery để MEDIUM,
 * consecutiveIndependentSuccesses = 0 (Slice 4 tính từ lịch sử `child_skill_state`).
 */
export function buildSnapshot(s: SnapshotSources): SessionSnapshot {
  const sig = s.signals ?? {};
  const sessionMinutes = Math.max(0, (Date.now() - s.sessionStartedAt.getTime()) / 60000);
  return {
    childAgeYears: ageYears(s.childBirthYear, s.childBirthMonth),
    stage: s.stage as SessionSnapshot['stage'],
    taskType: s.taskType,
    attemptsMade: s.attemptsMade,
    minimumAttemptsBeforeSolution: s.minimumAttemptsBeforeSolution,
    currentHelpLadderLevel: Math.max(0, Math.min(6, s.currentHelpLadderLevel)) as HelpLadderLevel,
    childRequestedHelp: sig.childRequestedHelp ?? true,
    secondsSincePrompt: sig.secondsSincePrompt ?? 999,
    configuredWaitSeconds: sig.configuredWaitSeconds ?? 12,
    consecutiveIndependentSuccesses: 0,
    independentSuccessThreshold: 3,
    independenceLevel: 'MEDIUM',
    masteryLevel: 'MEDIUM',
    repeatedErrors: sig.repeatedErrors ?? s.attemptsMade >= 2,
    languageLoadHigh: sig.languageLoadHigh ?? false,
    representationIsAbstract: sig.representationIsAbstract ?? false,
    presentationAnxietyObserved: sig.presentationAnxietyObserved ?? false,
    fatigue: {
      sessionMinutes,
      configuredSessionMinutesCap: s.configuredSessionMinutesCap,
      overloadObserved: sig.overloadObserved ?? false,
      distressObserved: sig.distressObserved ?? false,
    },
    outOfScopeRequest: sig.outOfScopeRequest ?? false,
  };
}
