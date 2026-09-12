import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  learningUnitSkill,
  hintInteraction,
  artifact,
  skillEvidence,
  learningUnit,
  interestSignal,
} from '../db/schema.js';
import { newId } from '../auth/crypto.js';

/**
 * Sinh minh chứng kỹ năng khi hoàn thành phiên. Nhiều minh chứng độ tin cậy thấp
 * (verifier=SYSTEM) — KHÔNG phải điểm; phụ huynh/giáo viên xác nhận sau (Slice sau).
 */
export async function recordSessionSkillEvidence(
  db: Database,
  args: { sessionId: string; childProfileId: string; learningUnitId: string },
): Promise<number> {
  const skills = await db
    .select()
    .from(learningUnitSkill)
    .where(eq(learningUnitSkill.unitId, args.learningUnitId));
  if (skills.length === 0) return 0;

  const hintCount = (
    await db.select({ id: hintInteraction.id }).from(hintInteraction).where(eq(hintInteraction.sessionId, args.sessionId))
  ).length;
  const arts = await db
    .select({ id: artifact.id, transcript: artifact.transcriptText })
    .from(artifact)
    .where(eq(artifact.sessionId, args.sessionId));

  const strength = hintCount === 0 ? 'DEVELOPING' : 'EMERGING';
  let inserted = 0;

  for (const s of skills) {
    await db.insert(skillEvidence).values({
      id: newId('se'),
      childProfileId: args.childProfileId,
      skillId: s.skillId,
      sessionId: args.sessionId,
      source: 'SESSION',
      strength,
      confidence: 'LOW',
      verifier: 'SYSTEM',
    });
    inserted += 1;

    // Nếu có sản phẩm (đặc biệt kèm lời kể) -> thêm minh chứng nguồn ARTIFACT cho kỹ năng PRIMARY.
    if (s.role === 'PRIMARY' && arts.length > 0) {
      const withTranscript = arts.find((a) => a.transcript) ?? arts[0]!;
      await db.insert(skillEvidence).values({
        id: newId('se'),
        childProfileId: args.childProfileId,
        skillId: s.skillId,
        sessionId: args.sessionId,
        artifactId: withTranscript.id,
        source: 'ARTIFACT',
        strength,
        confidence: withTranscript.transcript ? 'MED' : 'LOW',
        verifier: 'SYSTEM',
      });
      inserted += 1;
    }
  }
  return inserted;
}

/**
 * Khi hoàn thành phiên: sinh tín hiệu hứng thú tự động cho từng lĩnh vực của nhiệm vụ
 * (`source=SESSION_ENGAGEMENT`). Đây là dữ liệu "hứng thú được QUAN SÁT" nuôi interest-profile
 * Giai đoạn 4 — không phải khai báo. Idempotent theo `session_id`.
 */
export async function recordSessionInterestSignals(
  db: Database,
  args: { sessionId: string; childProfileId: string; learningUnitId: string },
): Promise<number> {
  const already = await db
    .select({ id: interestSignal.id })
    .from(interestSignal)
    .where(eq(interestSignal.sessionId, args.sessionId));
  if (already.length > 0) return 0;

  const units = await db
    .select({ domains: learningUnit.domains, title: learningUnit.title })
    .from(learningUnit)
    .where(eq(learningUnit.id, args.learningUnitId));
  const unit = units[0];
  if (!unit) return 0;
  const domains = [...new Set(unit.domains ?? [])];
  if (domains.length === 0) return 0;

  const hintCount = (
    await db.select({ id: hintInteraction.id }).from(hintInteraction).where(eq(hintInteraction.sessionId, args.sessionId))
  ).length;
  // Phiên đã hoàn thành: ít phụ thuộc gợi ý -> gắn kết cao hơn. Không có mức LOW ở đây (chỉ chạy khi hoàn thành).
  const strength = hintCount <= 1 ? 'HIGH' : 'MED';

  let inserted = 0;
  for (const domain of domains) {
    await db.insert(interestSignal).values({
      id: newId('isg'),
      childProfileId: args.childProfileId,
      sessionId: args.sessionId,
      domain,
      source: 'SESSION_ENGAGEMENT',
      strength,
      note: `Tự động từ phiên học: ${unit.title}`,
    });
    inserted += 1;
  }
  return inserted;
}
