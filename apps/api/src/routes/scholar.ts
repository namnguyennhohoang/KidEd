import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { AuthContext, Guards } from '../auth/context.js';
import { assertFamilyAccess } from '../auth/context.js';
import { childProfile, projectContribution, scholarProject } from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import {
  AI_ASSISTANCE_LEVELS,
  AI_NOTE_MIN_LEN,
  aiProvenanceOk,
  buildScholarPortfolio,
  CONTRIBUTION_KINDS,
  isAiAssistanceLevel,
  isContributionKind,
  isPathway,
  MAX_ACTIVE_PROJECTS,
  MAX_TARGET_MONTHS,
  MIN_TARGET_MONTHS,
  SCHOLAR_PATHWAYS,
} from '../learning/scholar.js';

export function registerScholarRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
  const parent = { preHandler: guards.requireParent };
  const pinned = { preHandler: guards.requirePinVerified };
  const authed = { preHandler: guards.requireAuth };

  async function loadChildForFamily(id: string, auth: AuthContext, reply: FastifyReply) {
    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const child = rows[0];
    if (!child) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (!assertFamilyAccess(reply, auth, child.familyId)) return null;
    return child;
  }

  /** Trả về {childId, familyId} nếu người gọi được phép ghi cho trẻ này, ngược lại đã reply lỗi. */
  async function resolveWriteTarget(
    id: string,
    auth: AuthContext,
    reply: FastifyReply,
  ): Promise<{ familyId: string } | null> {
    if (auth.kind === 'CHILD') {
      if (auth.childProfileId !== id) {
        reply.code(404).send({ error: 'not_found' });
        return null;
      }
      return { familyId: auth.familyId! };
    }
    if (auth.kind === 'PARENT') {
      const child = await loadChildForFamily(id, auth, reply);
      return child ? { familyId: child.familyId } : null;
    }
    reply.code(403).send({ error: 'forbidden' });
    return null;
  }

  app.get('/scholar/meta', authed, async () => ({
    pathways: [...SCHOLAR_PATHWAYS],
    contributionKinds: [...CONTRIBUTION_KINDS],
    aiAssistanceLevels: [...AI_ASSISTANCE_LEVELS],
    aiNoteMinLength: AI_NOTE_MIN_LEN,
  }));

  // Tạo dự án dài hạn (phụ huynh hoặc chính trẻ trong phiên trẻ).
  app.post('/scholar/projects', authed, async (req, reply) => {
    const body = z
      .object({
        childId: z.string(),
        title: z.string().min(1).max(200),
        drivingQuestion: z.string().min(1).max(2000),
        pathway: z.string().optional(),
        disciplines: z.array(z.string()).min(1).max(6),
        targetMonths: z.number().int(),
      })
      .parse(req.body);
    const auth = req.auth!;
    const target = await resolveWriteTarget(body.childId, auth, reply);
    if (!target) return;

    const pathway = body.pathway ?? 'UNDECIDED';
    if (!isPathway(pathway)) return reply.code(422).send({ error: 'unknown_pathway' });
    if (body.targetMonths < MIN_TARGET_MONTHS || body.targetMonths > MAX_TARGET_MONTHS) {
      return reply
        .code(422)
        .send({ error: 'target_months_out_of_range', min: MIN_TARGET_MONTHS, max: MAX_TARGET_MONTHS });
    }
    const active = await db
      .select({ id: scholarProject.id })
      .from(scholarProject)
      .where(and(eq(scholarProject.childProfileId, body.childId), eq(scholarProject.status, 'ACTIVE')));
    if (active.length >= MAX_ACTIVE_PROJECTS) {
      return reply.code(409).send({ error: 'too_many_active_projects', max: MAX_ACTIVE_PROJECTS });
    }

    const id = newId('scp');
    await db.insert(scholarProject).values({
      id,
      familyId: target.familyId,
      childProfileId: body.childId,
      title: body.title,
      drivingQuestion: body.drivingQuestion,
      pathway,
      disciplines: [...new Set(body.disciplines)],
      targetMonths: body.targetMonths,
      createdByUserId: auth.userId,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'scholar_project.created',
      resourceType: 'scholar_project',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { childId: body.childId, pathway },
    });
    return reply.code(201).send({ id, status: 'ACTIVE', pathway });
  });

  app.get('/scholar/projects', pinned, async (req, reply) => {
    const q = z.object({ childId: z.string() }).parse(req.query);
    const auth = req.auth!;
    const child = await loadChildForFamily(q.childId, auth, reply);
    if (!child) return;
    const rows = await db
      .select()
      .from(scholarProject)
      .where(eq(scholarProject.childProfileId, q.childId));
    rows.sort((a, b) => b.startedOn.getTime() - a.startedOn.getTime());
    const withCounts = await Promise.all(
      rows.map(async (p) => {
        const cs = await db
          .select()
          .from(projectContribution)
          .where(eq(projectContribution.projectId, p.id));
        cs.sort((a, b) => b.occurredOn.getTime() - a.occurredOn.getTime());
        return { ...p, contributions: cs };
      }),
    );
    return { projects: withCounts };
  });

  // Ghi một mốc/đóng góp — BẮT BUỘC khai báo AI khi mức != NONE.
  app.post('/scholar/projects/:id/contributions', authed, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        kind: z.string(),
        summary: z.string().min(1).max(4000),
        aiAssistanceLevel: z.string().optional(),
        aiAssistanceNote: z.string().max(2000).optional(),
        hoursSpent: z.number().int().min(0).max(10_000).optional(),
        artifactId: z.string().optional(),
        occurredOn: z.string().datetime().optional(),
      })
      .parse(req.body);
    const auth = req.auth!;

    const rows = await db.select().from(scholarProject).where(eq(scholarProject.id, id));
    const project = rows[0];
    if (!project) return reply.code(404).send({ error: 'not_found' });
    const target = await resolveWriteTarget(project.childProfileId, auth, reply);
    if (!target) return;
    if (project.status !== 'ACTIVE') return reply.code(409).send({ error: 'project_not_active' });

    if (!isContributionKind(body.kind)) return reply.code(422).send({ error: 'unknown_kind' });
    const level = body.aiAssistanceLevel ?? 'NONE';
    if (!isAiAssistanceLevel(level)) return reply.code(422).send({ error: 'bad_ai_level' });
    if (!aiProvenanceOk(level, body.aiAssistanceNote)) {
      return reply.code(422).send({
        error: 'ai_note_required',
        message: `Khi có hỗ trợ của AI (mức ${level}), phải mô tả cụ thể AI đã làm gì (≥ ${AI_NOTE_MIN_LEN} ký tự).`,
      });
    }

    const cid = newId('pct');
    await db.insert(projectContribution).values({
      id: cid,
      projectId: id,
      childProfileId: project.childProfileId,
      kind: body.kind,
      summary: body.summary,
      aiAssistanceLevel: level,
      aiAssistanceNote: body.aiAssistanceNote?.trim() ? body.aiAssistanceNote.trim() : null,
      hoursSpent: body.hoursSpent ?? null,
      artifactId: body.artifactId ?? null,
      occurredOn: body.occurredOn ? new Date(body.occurredOn) : new Date(),
      recordedByUserId: auth.userId,
    });
    return reply.code(201).send({ id: cid, aiAssistanceLevel: level });
  });

  app.post('/scholar/projects/:id/complete', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        reflectionNote: z.string().min(1).max(4000),
        status: z.enum(['COMPLETED', 'SHELVED']).default('COMPLETED'),
      })
      .parse(req.body);
    const auth = req.auth!;
    const rows = await db.select().from(scholarProject).where(eq(scholarProject.id, id));
    const project = rows[0];
    if (!project) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, project.familyId)) return;
    if (project.status !== 'ACTIVE') return reply.code(409).send({ error: 'not_active', status: project.status });

    await db
      .update(scholarProject)
      .set({ status: body.status, reflectionNote: body.reflectionNote, endedAt: new Date() })
      .where(eq(scholarProject.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'scholar_project.completed',
      resourceType: 'scholar_project',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { status: body.status },
    });
    return { id, status: body.status };
  });

  // Danh mục học giả + hồ sơ chữ T + bản kê khai AI — PIN-gated. KHÔNG dự báo trúng tuyển.
  app.get('/children/:id/scholar-portfolio', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const child = await loadChildForFamily(id, auth, reply);
    if (!child) return;
    return buildScholarPortfolio(db, id, child.familyId);
  });
}
