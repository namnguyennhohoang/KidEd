import { eq } from 'drizzle-orm';
import { ERROR_CAUSE_VI } from '@tiny/domain';
import type { Database } from '../db/client.js';
import { skillEvidence, attemptError, skill } from '../db/schema.js';

export type Band = 'EMERGING' | 'DEVELOPING' | 'SECURE';
export type Confidence = 'LOW' | 'MED' | 'HIGH';

export interface SkillReadiness {
  skillId: string;
  title: string | null;
  group: string | null;
  evidenceCount: number;
  latestStrength: string | null;
  latestAt: string | null;
  band: Band;
  confidence: Confidence;
  errorCauses: Record<string, number>;
  /** Kỹ năng thuộc overlay nhưng chưa có minh chứng nào. */
  notStarted: boolean;
}

export interface Readiness {
  childId: string;
  overlay: string | null;
  bySkill: SkillReadiness[];
  summary: { skillsTracked: number; secure: number; developing: number; emerging: number; notStarted: number };
  disclaimer: string;
}

const RECENT_MS = 60 * 86_400_000;

/**
 * Mức sẵn sàng THEO TỪNG KỸ NĂNG từ minh chứng + phân loại lỗi.
 * KHÔNG có điểm tổng hợp, KHÔNG dự báo đậu/rớt (spec Module E, §6.13).
 */
export async function buildReadiness(
  db: Database,
  childProfileId: string,
  overlay: string | null,
  now: Date = new Date(),
): Promise<Readiness> {
  const evidence = await db.select().from(skillEvidence).where(eq(skillEvidence.childProfileId, childProfileId));
  const errors = await db.select().from(attemptError).where(eq(attemptError.childProfileId, childProfileId));
  const allSkills = await db.select().from(skill);
  const skillMeta = new Map(allSkills.map((s) => [s.code, s]));

  // Kỹ năng cần xét: có minh chứng/lỗi + (nếu lọc overlay) toàn bộ kỹ năng của overlay đó.
  const seen = new Set<string>([
    ...evidence.map((e) => e.skillId),
    ...errors.map((e) => e.skillId ?? '').filter(Boolean),
  ]);
  const overlaySkills = overlay
    ? allSkills.filter((s) => (s.overlays ?? []).includes(overlay)).map((s) => s.code)
    : [];
  const skills = overlay ? new Set(overlaySkills) : seen;
  for (const c of overlaySkills) skills.add(c); // gộp cả kỹ năng overlay chưa có minh chứng

  const bySkill: SkillReadiness[] = [];
  for (const skillId of skills) {
    const ev = evidence.filter((e) => e.skillId === skillId);
    const errs = errors.filter((e) => e.skillId === skillId);

    const sorted = [...ev].sort((a, b) => b.recencyAt.getTime() - a.recencyAt.getTime());
    const latest = sorted[0] ?? null;
    const strongOrDev = ev.filter((e) => e.strength === 'SECURE' || e.strength === 'DEVELOPING').length;
    const misconception = errs.filter((e) => e.cause === 'MISCONCEPTION').length;

    let band: Band = 'EMERGING';
    if (ev.length >= 3 && strongOrDev >= 3 && misconception === 0) band = 'SECURE';
    else if (ev.length >= 2 && strongOrDev >= 1) band = 'DEVELOPING';

    const recent = latest ? now.getTime() - latest.recencyAt.getTime() < RECENT_MS : false;
    let confidence: Confidence = 'LOW';
    if (ev.length >= 6 && recent) confidence = 'HIGH';
    else if (ev.length >= 3) confidence = 'MED';

    const errorCauses: Record<string, number> = {};
    for (const e of errs) errorCauses[e.cause] = (errorCauses[e.cause] ?? 0) + 1;

    const meta = skillMeta.get(skillId);
    bySkill.push({
      skillId,
      title: meta?.titleVi ?? null,
      group: meta?.group ?? null,
      evidenceCount: ev.length,
      latestStrength: latest?.strength ?? null,
      latestAt: latest?.recencyAt.toISOString() ?? null,
      band,
      confidence,
      errorCauses,
      notStarted: ev.length === 0 && errs.length === 0,
    });
  }

  bySkill.sort((a, b) => a.skillId.localeCompare(b.skillId));
  return {
    childId: childProfileId,
    overlay,
    bySkill,
    summary: {
      skillsTracked: bySkill.filter((s) => !s.notStarted).length,
      secure: bySkill.filter((s) => s.band === 'SECURE').length,
      developing: bySkill.filter((s) => s.band === 'DEVELOPING').length,
      emerging: bySkill.filter((s) => s.band === 'EMERGING' && !s.notStarted).length,
      notStarted: bySkill.filter((s) => s.notStarted).length,
    },
    disclaimer:
      'Đây là mức sẵn sàng theo từng kỹ năng dựa trên minh chứng đã thu thập. Không dùng để dự báo kết quả thi cử và không phải xếp hạng.',
  };
}

export function errorCauseList(): Array<{ code: string; label: string }> {
  return Object.entries(ERROR_CAUSE_VI).map(([code, label]) => ({ code, label }));
}
