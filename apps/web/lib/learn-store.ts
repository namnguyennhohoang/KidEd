'use client';

import { evaluate, decideFatigue, defaultSnapshot, type FatigueAction, type RuleFiring } from '@tiny/domain';
import { coachTurnSync, type AiCoachResponse, type UnitHint } from '@tiny/ai-gateway';
import type { ChildContext, LearningUnit } from './api';
import { cgid, csrfToken } from './api';
import { flushArtifacts } from './artifact-store';

/**
 * Phiên học "local-first" (ADR 0005): mọi bước ghi vào IndexedDB trước, đồng bộ lên
 * server qua `/sessions/sync` khi có mạng. Hint tính ngay tại client bằng cùng rule engine
 * + coach tất định như server nên hoạt động cả khi mất mạng.
 */

const DB = 'tiny-learn';
const STORE = 'sessions';

export interface LocalHint {
  helpLadderLevel: number;
  maxAllowedLevel: number;
  intent: string;
  childMessage: string;
  requestedAt: string;
  firings: RuleFiring[];
}

export interface LocalSession {
  cgid: string;
  unitId: string;
  unit: LearningUnit;
  stage: string;
  minimumAttempts: number;
  startedAt: string;
  timed?: boolean;
  timeBudgetSeconds?: number;
  plan?: { text?: string; choiceIds?: string[] };
  attempts: { cgid: string; ordinal: number; content: Record<string, unknown>; submittedAt: string }[];
  hints: LocalHint[];
  events: { type: string; cgid: string; occurredAt: string; payload?: Record<string, unknown> }[];
  reflection?: { prompt: string; responseType: 'VOICE' | 'TEXT' | 'IMAGE_CHOICE'; responseText?: string; responseRef?: string };
  completed: boolean;
  serverSessionId?: string;
  syncedAt?: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'cgid' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const r = fn(db.transaction(STORE, mode).objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function persist(s: LocalSession): Promise<void> {
  await tx('readwrite', (st) => st.put(s));
}

export async function getLocalSession(cg: string): Promise<LocalSession | undefined> {
  return tx<LocalSession | undefined>('readonly', (st) => st.get(cg));
}

/** Dùng cho flushArtifacts: cgid phiên -> server session id (đã sync) hoặc null. */
export async function resolveServerSessionId(sessionCgid: string): Promise<string | null> {
  const s = await getLocalSession(sessionCgid);
  if (s?.serverSessionId) return s.serverSessionId;
  if (s) return syncSession(s); // thử sync rồi lấy id
  return null;
}

export function createLocalSession(
  unit: LearningUnit,
  stage: string,
  opts: { timed?: boolean; timeBudgetSeconds?: number } = {},
): LocalSession {
  const s: LocalSession = {
    cgid: cgid('ses'),
    unitId: unit.id,
    unit,
    stage,
    minimumAttempts: Math.max(1, unit.questFlow.attempt_requirement?.minimum_attempts_before_solution ?? 1),
    startedAt: new Date().toISOString(),
    attempts: [],
    hints: [],
    events: [{ type: 'SESSION_STARTED', cgid: cgid('ev'), occurredAt: new Date().toISOString() }],
    completed: false,
  };
  if (opts.timed) {
    s.timed = true;
    // Kẹp trong 30–3600s cho khớp ràng buộc của API.
    s.timeBudgetSeconds = Math.min(3600, Math.max(30, Math.round(opts.timeBudgetSeconds ?? 600)));
  }
  return s;
}

function toUnitHints(unit: LearningUnit): UnitHint[] {
  return (unit.hints ?? []).map((h) => {
    const u: UnitHint = { level: Number(h.level), type: h.type };
    if (typeof h.content === 'string') u.content = h.content;
    return u;
  });
}

function snapshotFor(s: LocalSession, ctx: ChildContext | null, secondsSincePrompt: number) {
  const elapsedMin = (Date.now() - Date.parse(s.startedAt)) / 60000;
  return defaultSnapshot({
    stage: s.stage as ReturnType<typeof defaultSnapshot>['stage'],
    attemptsMade: s.attempts.length,
    minimumAttemptsBeforeSolution: s.minimumAttempts,
    currentHelpLadderLevel: (s.hints.at(-1)?.helpLadderLevel ?? 0) as ReturnType<typeof defaultSnapshot>['currentHelpLadderLevel'],
    childRequestedHelp: true,
    secondsSincePrompt,
    fatigue: {
      sessionMinutes: Math.max(0, elapsedMin),
      configuredSessionMinutesCap: ctx?.screenSessionMinutes ?? 10,
      overloadObserved: false,
      distressObserved: false,
    },
  });
}

/** Kiểm tra sức khỏe học tập tại client (thời lượng phiên) — EDU-2. */
export function checkFatigue(s: LocalSession, ctx: ChildContext | null): FatigueAction {
  return decideFatigue(snapshotFor(s, ctx, 999)).action;
}

/** Tính hint tại client — kết quả trùng với server (rule engine tất định). */
export function computeHint(
  s: LocalSession,
  secondsSincePrompt: number,
  ctx: ChildContext | null = null,
): AiCoachResponse {
  const snapshot = snapshotFor(s, ctx, secondsSincePrompt);
  const directive = evaluate(snapshot);
  const coach = coachTurnSync({
    directive,
    unitHints: toUnitHints(s.unit),
    prompts: {
      hook: s.unit.questFlow.hook,
      plan_prompt: s.unit.questFlow.plan_prompt,
      reflection_prompt: s.unit.questFlow.reflection_prompt,
    },
    childRequestedHelp: true,
    childAgeYears: ctx?.ageYears ?? 6,
  });
  s.hints.push({
    helpLadderLevel: coach.hint_level,
    maxAllowedLevel: directive.maxHelpLadderLevel,
    intent: coach.intent,
    childMessage: coach.child_message,
    requestedAt: new Date().toISOString(),
    firings: directive.firings,
  });
  s.events.push({ type: 'HINT_REQUESTED', cgid: cgid('ev'), occurredAt: new Date().toISOString() });
  return coach;
}

export function addAttempt(s: LocalSession, content: Record<string, unknown>): number {
  const ordinal = s.attempts.length + 1;
  s.attempts.push({ cgid: cgid('att'), ordinal, content, submittedAt: new Date().toISOString() });
  s.events.push({ type: 'ATTEMPT_SUBMITTED', cgid: cgid('ev'), occurredAt: new Date().toISOString(), payload: { ordinal } });
  return ordinal;
}

/** Gửi bundle lên server. Trả serverSessionId nếu thành công; null nếu offline/lỗi. */
export async function syncSession(s: LocalSession): Promise<string | null> {
  try {
    const res = await fetch('/api/sessions/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken() },
      body: JSON.stringify({
        session: {
          clientGeneratedId: s.cgid,
          learningUnitId: s.unitId,
          startedAt: s.startedAt,
          timed: s.timed,
          timeBudgetSeconds: s.timeBudgetSeconds,
          plan: s.plan,
        },
        attempts: s.attempts.map((a) => ({ ...a, clientGeneratedId: a.cgid })),
        hints: s.hints,
        events: s.events.map((e) => ({ type: e.type, clientGeneratedId: e.cgid, occurredAt: e.occurredAt, payload: e.payload })),
        reflection: s.reflection,
        completed: s.completed,
      }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    s.serverSessionId = j.sessionId;
    s.syncedAt = new Date().toISOString();
    await persist(s);
    return j.sessionId as string;
  } catch {
    return null;
  }
}

export async function syncAllPending(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  const all = (await tx<LocalSession[]>('readonly', (st) => st.getAll())) ?? [];
  let synced = 0;
  for (const s of all) {
    if (s.completed && s.syncedAt) continue;
    if (await syncSession(s)) synced += 1;
  }
  await flushArtifacts(resolveServerSessionId);
  return synced;
}

export function installSyncOnReconnect(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('online', () => void syncAllPending());
}
