import { asc, eq, inArray } from 'drizzle-orm';
import {
  independentCompletionRate,
  medianHintLevel,
  strategyCount,
  type SessionEvent,
} from '@tiny/analytics';
import type { Database } from '../db/client.js';
import {
  session,
  sessionEvent,
  hintInteraction,
  reflection,
  artifact,
  skillEvidence,
  parentObservation,
} from '../db/schema.js';

/**
 * Số liệu Parent Dashboard (spec mục 6.13).
 * KHÔNG có: xếp hạng, dự báo đậu/rớt, điểm IQ, suy đoán sức khỏe tâm thần, điểm tổng hợp.
 * North-star: mức độ độc lập, chất lượng minh chứng, chuyển giao đời thực, sức khỏe học tập.
 */
export interface Dashboard {
  independence: {
    completedSessions: number;
    independentCompletionRate: number | null;
  };
  initiation: { medianLatencySeconds: number | null };
  hints: { medianLevel: number | null; trend: 'down' | 'flat' | 'up' | null; totalRequested: number };
  strategies: { averagePerSession: number | null };
  explanation: { reflectionsCompleted: number; artifactsWithTranscript: number };
  skillEvidence: { count: number; distinctSkills: number };
  recentObservations: Array<{ text: string; createdAt: string; tags: string[] }>;
  suggestedNextAction: string;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

export async function buildDashboard(db: Database, childProfileId: string): Promise<Dashboard> {
  const sessions = await db
    .select()
    .from(session)
    .where(eq(session.childProfileId, childProfileId))
    .orderBy(asc(session.startedAt));

  const ids = sessions.map((s) => s.id);
  const [events, hints, reflections, artifacts, evidence, observations] = await Promise.all([
    ids.length ? db.select().from(sessionEvent).where(inArray(sessionEvent.sessionId, ids)) : [],
    ids.length ? db.select().from(hintInteraction).where(inArray(hintInteraction.sessionId, ids)) : [],
    ids.length ? db.select().from(reflection).where(inArray(reflection.sessionId, ids)) : [],
    ids.length ? db.select().from(artifact).where(inArray(artifact.sessionId, ids)) : [],
    db.select().from(skillEvidence).where(eq(skillEvidence.childProfileId, childProfileId)),
    db
      .select()
      .from(parentObservation)
      .where(eq(parentObservation.childProfileId, childProfileId))
      .orderBy(asc(parentObservation.createdAt)),
  ]);

  const hintsBySession = new Map<string, number>();
  for (const h of hints) hintsBySession.set(h.sessionId, (hintsBySession.get(h.sessionId) ?? 0) + 1);

  const completed = sessions.filter((s) => s.status === 'COMPLETED');
  const summaries = completed.map((s) => ({
    sessionId: s.id,
    completed: true,
    hintCount: hintsBySession.get(s.id) ?? 0,
  }));

  // Initiation latency: started_at -> first_action_at (giây) cho phiên có mốc.
  const latencies = sessions
    .filter((s) => s.firstActionAt)
    .map((s) => (s.firstActionAt!.getTime() - s.startedAt.getTime()) / 1000)
    .filter((n) => n >= 0);

  // Hint trend: so trung vị nửa đầu vs nửa sau (theo thời gian phiên có hint).
  const hintLevelsChrono = sessions
    .flatMap((s) => hints.filter((h) => h.sessionId === s.id))
    .map((h) => h.helpLadderLevel);
  let trend: Dashboard['hints']['trend'] = null;
  if (hintLevelsChrono.length >= 4) {
    const mid = Math.floor(hintLevelsChrono.length / 2);
    const a = median(hintLevelsChrono.slice(0, mid))!;
    const b = median(hintLevelsChrono.slice(mid))!;
    trend = b < a - 0.25 ? 'down' : b > a + 0.25 ? 'up' : 'flat';
  }

  // Strategy count per session.
  const evBySession = new Map<string, SessionEvent[]>();
  for (const e of events) {
    const list = evBySession.get(e.sessionId) ?? [];
    list.push({
      type: e.type as SessionEvent['type'],
      sessionId: e.sessionId,
      occurredAt: e.occurredAt.toISOString(),
      clientGeneratedId: e.clientGeneratedId,
      source: 'SERVER',
    });
    evBySession.set(e.sessionId, list);
  }
  const stratCounts = sessions.map((s) => strategyCount(evBySession.get(s.id) ?? []));
  const avgStrat = stratCounts.length ? stratCounts.reduce((a, b) => a + b, 0) / stratCounts.length : null;

  const dash: Dashboard = {
    independence: {
      completedSessions: completed.length,
      independentCompletionRate: independentCompletionRate(summaries),
    },
    initiation: { medianLatencySeconds: median(latencies) },
    hints: {
      medianLevel: medianHintLevel(hints.map((h) => ({ sessionId: h.sessionId, helpLadderLevel: h.helpLadderLevel, requestedAt: h.requestedAt.toISOString() }))),
      trend,
      totalRequested: hints.length,
    },
    strategies: { averagePerSession: avgStrat === null ? null : Math.round(avgStrat * 100) / 100 },
    explanation: {
      reflectionsCompleted: reflections.length,
      artifactsWithTranscript: artifacts.filter((a) => a.transcriptText).length,
    },
    skillEvidence: {
      count: evidence.length,
      distinctSkills: new Set(evidence.map((e) => e.skillId)).size,
    },
    recentObservations: observations.slice(-5).map((o) => ({
      text: o.text,
      createdAt: o.createdAt.toISOString(),
      tags: o.tags ?? [],
    })),
    suggestedNextAction: suggestNextAction({
      independentRate: independentCompletionRate(summaries),
      medianHint: medianHintLevel(hints.map((h) => ({ sessionId: h.sessionId, helpLadderLevel: h.helpLadderLevel, requestedAt: h.requestedAt.toISOString() }))),
      completed: completed.length,
    }),
  };
  return dash;
}

function suggestNextAction(x: { independentRate: number | null; medianHint: number | null; completed: number }): string {
  if (x.completed === 0) return 'Cùng bé thử một nhiệm vụ ngắn để bé tự bắt đầu và tự kết thúc.';
  if (x.independentRate !== null && x.independentRate < 0.4) {
    return 'Chọn một nhiệm vụ vừa sức và để bé tự bắt đầu; chỉ hỗ trợ khi bé chủ động xin.';
  }
  if (x.medianHint !== null && x.medianHint >= 3) {
    return 'Thử một hoạt động quen thuộc hơn để bé làm phần lớn một mình trong tuần này.';
  }
  return 'Ghi nhận một "Brave Step" nhỏ: bé kể lại bài làm cho một người thân.';
}
