import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  family,
  user,
  childProfile,
  childInterest,
  childGoal,
  childAccommodation,
  childAssent,
  consent,
  session,
  sessionEvent,
  attempt,
  hintInteraction,
  ruleFiring,
  reflection,
  artifact,
  artifactVersion,
  parentObservation,
  skillEvidence,
  attemptError,
  explorationCycle,
  interestSignal,
  specialisationChoice,
  scholarProject,
  projectContribution,
  admissionRule,
  educatorShare,
  auditLog,
} from '../db/schema.js';

/**
 * Gom toàn bộ dữ liệu của một gia đình (hoặc một trẻ) để export.
 * Mật khẩu/PIN/token KHÔNG bao giờ nằm trong export.
 */
export async function collectExport(
  db: Database,
  familyId: string,
  childProfileId?: string,
): Promise<Record<string, unknown>> {
  const fam = await db.select().from(family).where(eq(family.id, familyId));
  const users = (await db.select().from(user).where(eq(user.familyId, familyId))).map((u) => ({
    id: u.id,
    role: u.role,
    email: u.email,
    displayName: u.displayName,
    createdAt: u.createdAt,
  }));

  const children = childProfileId
    ? await db.select().from(childProfile).where(eq(childProfile.id, childProfileId))
    : await db.select().from(childProfile).where(eq(childProfile.familyId, familyId));
  const childIds = children.map((c) => c.id);

  const pick = async <T>(rows: Promise<T[]>) => (childIds.length ? rows : Promise.resolve([] as T[]));

  const sessions = await pick(db.select().from(session).where(inArray(session.childProfileId, childIds)));
  const sessionIds = sessions.map((s) => s.id);
  const bySession = <T>(rows: Promise<T[]>) => (sessionIds.length ? rows : Promise.resolve([] as T[]));

  return {
    exportedAt: new Date().toISOString(),
    scope: childProfileId ? { childProfileId } : { familyId },
    family: fam[0] ?? null,
    users,
    children,
    childInterests: await pick(db.select().from(childInterest).where(inArray(childInterest.childProfileId, childIds))),
    childGoals: await pick(db.select().from(childGoal).where(inArray(childGoal.childProfileId, childIds))),
    childAccommodations: await pick(
      db.select().from(childAccommodation).where(inArray(childAccommodation.childProfileId, childIds)),
    ),
    consents: await db.select().from(consent).where(eq(consent.familyId, familyId)),
    childAssents: await pick(db.select().from(childAssent).where(inArray(childAssent.childProfileId, childIds))),
    sessions,
    sessionEvents: await bySession(db.select().from(sessionEvent).where(inArray(sessionEvent.sessionId, sessionIds))),
    attempts: await bySession(db.select().from(attempt).where(inArray(attempt.sessionId, sessionIds))),
    hintInteractions: await bySession(
      db.select().from(hintInteraction).where(inArray(hintInteraction.sessionId, sessionIds)),
    ),
    ruleFirings: await bySession(db.select().from(ruleFiring).where(inArray(ruleFiring.sessionId, sessionIds))),
    reflections: await bySession(db.select().from(reflection).where(inArray(reflection.sessionId, sessionIds))),
    artifacts: await bySession(db.select().from(artifact).where(inArray(artifact.sessionId, sessionIds))),
    artifactVersions: await (async () => {
      const artIds = (
        await bySession(db.select({ id: artifact.id }).from(artifact).where(inArray(artifact.sessionId, sessionIds)))
      ).map((a) => a.id);
      return artIds.length
        ? db.select().from(artifactVersion).where(inArray(artifactVersion.artifactId, artIds))
        : [];
    })(),
    parentObservations: await pick(
      db.select().from(parentObservation).where(inArray(parentObservation.childProfileId, childIds)),
    ),
    skillEvidence: await pick(db.select().from(skillEvidence).where(inArray(skillEvidence.childProfileId, childIds))),
    attemptErrors: await pick(db.select().from(attemptError).where(inArray(attemptError.childProfileId, childIds))),
    // Giai đoạn 4 — Specialisation.
    explorationCycles: await pick(
      db.select().from(explorationCycle).where(inArray(explorationCycle.childProfileId, childIds)),
    ),
    interestSignals: await pick(
      db.select().from(interestSignal).where(inArray(interestSignal.childProfileId, childIds)),
    ),
    specialisationChoices: await pick(
      db.select().from(specialisationChoice).where(inArray(specialisationChoice.childProfileId, childIds)),
    ),
    // Giai đoạn 5 — Global Scholar.
    scholarProjects: await pick(
      db.select().from(scholarProject).where(inArray(scholarProject.childProfileId, childIds)),
    ),
    projectContributions: await pick(
      db.select().from(projectContribution).where(inArray(projectContribution.childProfileId, childIds)),
    ),
    // Quy chế tuyển sinh do gia đình tự thêm (không gồm bản nền của nền tảng).
    admissionRules: await db.select().from(admissionRule).where(eq(admissionRule.familyId, familyId)),
    // Chia sẻ cho giáo viên/cố vấn — KHÔNG kèm token/mã (chỉ giữ bản băm ở DB, không export).
    educatorShares: await pick(
      db
        .select({
          id: educatorShare.id,
          childProfileId: educatorShare.childProfileId,
          role: educatorShare.role,
          scope: educatorShare.scope,
          label: educatorShare.label,
          mode: educatorShare.mode,
          inviteEmail: educatorShare.inviteEmail,
          educatorUserId: educatorShare.educatorUserId,
          status: educatorShare.status,
          createdAt: educatorShare.createdAt,
          expiresAt: educatorShare.expiresAt,
          lastAccessedAt: educatorShare.lastAccessedAt,
        })
        .from(educatorShare)
        .where(inArray(educatorShare.childProfileId, childIds)),
    ),
    auditLog: await db.select().from(auditLog).where(eq(auditLog.familyId, familyId)),
  };
}
