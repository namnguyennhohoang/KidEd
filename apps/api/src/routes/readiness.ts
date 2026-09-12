import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { isErrorCause } from '@tiny/domain';
import type { Database } from '../db/client.js';
import type { Guards } from '../auth/context.js';
import { assertFamilyAccess } from '../auth/context.js';
import { attempt, attemptError, childProfile, session, skill } from '../db/schema.js';
import { and } from 'drizzle-orm';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import { buildReadiness, errorCauseList } from '../learning/readiness.js';

export function registerReadinessRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
  const parent = { preHandler: guards.requireParent };
  const pinned = { preHandler: guards.requirePinVerified };

  app.get('/learning/error-causes', { preHandler: guards.requireAuth }, async () => ({ causes: errorCauseList() }));

  // Duyệt Skill Graph.
  app.get('/learning/skills', { preHandler: guards.requireAuth }, async (req) => {
    const q = z.object({ group: z.string().optional(), overlay: z.string().optional() }).parse(req.query);
    const conds = [];
    if (q.group) conds.push(eq(skill.group, q.group));
    const rows = await db.select().from(skill).where(conds.length ? and(...conds) : undefined);
    const filtered = q.overlay ? rows.filter((s) => (s.overlays ?? []).includes(q.overlay!)) : rows;
    return { skills: filtered.sort((a, b) => a.group.localeCompare(b.group) || a.code.localeCompare(b.code)) };
  });

  // Phụ huynh/giáo viên phân loại nguyên nhân lỗi cho một lần thử (spec Module C).
  app.post('/sessions/:id/attempts/:attemptId/error', parent, async (req, reply) => {
    const { id, attemptId } = z.object({ id: z.string(), attemptId: z.string() }).parse(req.params);
    const body = z
      .object({ cause: z.string(), skillId: z.string().max(80).optional(), note: z.string().max(1000).optional() })
      .parse(req.body);
    if (!isErrorCause(body.cause)) return reply.code(400).send({ error: 'unknown_cause' });
    const auth = req.auth!;

    const rows = await db
      .select({ cp: session.childProfileId, familyId: childProfile.familyId })
      .from(session)
      .innerJoin(childProfile, eq(childProfile.id, session.childProfileId))
      .where(eq(session.id, id));
    const s = rows[0];
    if (!s) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, s.familyId)) return;

    const att = await db.select({ id: attempt.id }).from(attempt).where(eq(attempt.id, attemptId));
    if (!att[0]) return reply.code(404).send({ error: 'attempt_not_found' });

    const errId = newId('aer');
    await db.insert(attemptError).values({
      id: errId,
      attemptId,
      sessionId: id,
      childProfileId: s.cp,
      skillId: body.skillId ?? null,
      cause: body.cause,
      note: body.note ?? null,
      classifiedBy: auth.role === 'TEACHER' ? 'TEACHER' : 'PARENT',
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'attempt_error.classified',
      resourceType: 'attempt',
      resourceId: attemptId,
      familyId: auth.familyId,
      metadata: { cause: body.cause },
    });
    return reply.code(201).send({ id: errId });
  });

  // Mức sẵn sàng theo từng kỹ năng — PIN-gated (như dashboard). KHÔNG dự báo đậu/rớt.
  app.get('/children/:id/readiness', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const q = z.object({ overlay: z.string().optional() }).parse(req.query);
    const auth = req.auth!;
    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const child = rows[0];
    if (!child) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, child.familyId)) return;

    return buildReadiness(db, id, q.overlay ?? null);
  });
}
