import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { AuthContext, Guards } from '../auth/context.js';
import { assertFamilyAccess } from '../auth/context.js';
import {
  childProfile,
  explorationCycle,
  interestSignal,
  specialisationChoice,
} from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import {
  buildDepthPlan,
  buildInterestProfile,
  isDomain,
  isInterestSource,
  isInterestStrength,
  KNOWN_DOMAINS,
  MAX_PLANNED_WEEKS,
  MIN_CYCLE_DOMAINS,
  MIN_PLANNED_WEEKS,
  SPEC_CHOICE_DISCLAIMER,
} from '../learning/specialisation.js';

export function registerSpecialisationRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
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

  app.get('/specialisation/domains', authed, async () => ({ domains: [...KNOWN_DOMAINS] }));

  // Tạo chu kỳ trải nghiệm 8–12 tuần, >= 3 lĩnh vực. KHÔNG có "môn chuyên đã chọn".
  app.post('/specialisation/cycles', parent, async (req, reply) => {
    const body = z
      .object({
        childId: z.string(),
        title: z.string().min(1).max(160),
        domains: z.array(z.string()).min(1).max(KNOWN_DOMAINS.length),
        plannedWeeks: z.number().int(),
      })
      .parse(req.body);
    const auth = req.auth!;
    const child = await loadChildForFamily(body.childId, auth, reply);
    if (!child) return;

    if (body.plannedWeeks < MIN_PLANNED_WEEKS || body.plannedWeeks > MAX_PLANNED_WEEKS) {
      return reply
        .code(422)
        .send({ error: 'planned_weeks_out_of_range', min: MIN_PLANNED_WEEKS, max: MAX_PLANNED_WEEKS });
    }
    const domains = [...new Set(body.domains)];
    if (domains.length < MIN_CYCLE_DOMAINS) {
      return reply.code(422).send({ error: 'need_multiple_domains', min: MIN_CYCLE_DOMAINS });
    }
    const bad = domains.filter((d) => !isDomain(d));
    if (bad.length) return reply.code(422).send({ error: 'unknown_domain', domains: bad });

    const active = await db
      .select({ id: explorationCycle.id })
      .from(explorationCycle)
      .where(and(eq(explorationCycle.childProfileId, body.childId), eq(explorationCycle.status, 'ACTIVE')));
    if (active[0]) return reply.code(409).send({ error: 'cycle_already_active', cycleId: active[0].id });

    const id = newId('exc');
    await db.insert(explorationCycle).values({
      id,
      familyId: child.familyId,
      childProfileId: body.childId,
      title: body.title,
      domains,
      plannedWeeks: body.plannedWeeks,
      createdByUserId: auth.userId,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'exploration_cycle.created',
      resourceType: 'exploration_cycle',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { childId: body.childId, domains, plannedWeeks: body.plannedWeeks },
    });
    return reply.code(201).send({ id, status: 'ACTIVE', domains, plannedWeeks: body.plannedWeeks });
  });

  app.get('/specialisation/cycles', pinned, async (req, reply) => {
    const q = z.object({ childId: z.string() }).parse(req.query);
    const auth = req.auth!;
    const child = await loadChildForFamily(q.childId, auth, reply);
    if (!child) return;
    const rows = await db
      .select()
      .from(explorationCycle)
      .where(eq(explorationCycle.childProfileId, q.childId));
    rows.sort((a, b) => b.startedOn.getTime() - a.startedOn.getTime());
    return { cycles: rows };
  });

  // Kết thúc chu kỳ + ghi reflection. KHÔNG nhận và KHÔNG sinh "môn chuyên nên chọn".
  app.post('/specialisation/cycles/:id/complete', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        reflectionNote: z.string().min(1).max(4000),
        status: z.enum(['COMPLETED', 'ABANDONED']).default('COMPLETED'),
      })
      .parse(req.body);
    const auth = req.auth!;
    const rows = await db.select().from(explorationCycle).where(eq(explorationCycle.id, id));
    const cycle = rows[0];
    if (!cycle) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, cycle.familyId)) return;
    if (cycle.status !== 'ACTIVE') return reply.code(409).send({ error: 'not_active', status: cycle.status });

    await db
      .update(explorationCycle)
      .set({ status: body.status, reflectionNote: body.reflectionNote, completedAt: new Date() })
      .where(eq(explorationCycle.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'exploration_cycle.completed',
      resourceType: 'exploration_cycle',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { status: body.status },
    });
    return {
      id,
      status: body.status,
      note: 'Chu kỳ đã khép lại. Đây là tư liệu trải nghiệm, không phải kết luận về môn chuyên.',
    };
  });

  // Ghi 1 tín hiệu hứng thú — phụ huynh, hoặc chính trẻ trong phiên trẻ.
  app.post('/children/:id/interest-signals', authed, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        domain: z.string(),
        source: z.string().optional(),
        strength: z.string(),
        note: z.string().max(1000).optional(),
        cycleId: z.string().optional(),
        observedAt: z.string().datetime().optional(),
      })
      .parse(req.body);
    const auth = req.auth!;

    if (auth.kind === 'CHILD') {
      if (auth.childProfileId !== id) return reply.code(404).send({ error: 'not_found' });
    } else if (auth.kind === 'PARENT') {
      const child = await loadChildForFamily(id, auth, reply);
      if (!child) return;
    } else {
      return reply.code(403).send({ error: 'forbidden' });
    }

    if (!isDomain(body.domain)) return reply.code(422).send({ error: 'unknown_domain' });
    if (!isInterestStrength(body.strength)) return reply.code(422).send({ error: 'bad_strength' });
    const source =
      body.source ?? (auth.kind === 'CHILD' ? 'CHILD_SELF' : 'PARENT_OBSERVED');
    if (!isInterestSource(source)) return reply.code(422).send({ error: 'bad_source' });

    let cycleId: string | null = null;
    if (body.cycleId) {
      const c = await db.select().from(explorationCycle).where(eq(explorationCycle.id, body.cycleId));
      if (!c[0] || c[0].childProfileId !== id) return reply.code(422).send({ error: 'bad_cycle' });
      cycleId = body.cycleId;
    }

    const sigId = newId('isg');
    await db.insert(interestSignal).values({
      id: sigId,
      childProfileId: id,
      cycleId,
      domain: body.domain,
      source,
      strength: body.strength,
      note: body.note ?? null,
      observedAt: body.observedAt ? new Date(body.observedAt) : new Date(),
      recordedByUserId: auth.userId,
    });
    return reply.code(201).send({ id: sigId, source });
  });

  // Bức tranh hứng thú theo thời gian — PIN-gated. KHÔNG đề xuất môn chuyên, KHÔNG xếp hạng.
  app.get('/children/:id/interest-profile', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const child = await loadChildForFamily(id, auth, reply);
    if (!child) return;
    return buildInterestProfile(db, id);
  });

  /* ─────────  SPEC_HS_READINESS — chốt môn chuyên (chính + dự phòng), version hóa  ───────── */

  const subjectPairShape = {
    primarySubject: z.string(),
    backupSubject: z.string(),
    rationale: z.string().min(1).max(4000),
    basedOnCycleId: z.string().optional(),
  };
  const subjectPair = z.object(subjectPairShape);

  async function activeChoice(childId: string) {
    const rows = await db
      .select()
      .from(specialisationChoice)
      .where(and(eq(specialisationChoice.childProfileId, childId), eq(specialisationChoice.status, 'ACTIVE')));
    return rows[0] ?? null;
  }

  async function insertChoice(
    childId: string,
    familyId: string,
    auth: AuthContext,
    b: z.infer<typeof subjectPair>,
  ): Promise<string> {
    const id = newId('spc');
    await db.insert(specialisationChoice).values({
      id,
      familyId,
      childProfileId: childId,
      primarySubject: b.primarySubject,
      backupSubject: b.backupSubject,
      rationale: b.rationale,
      basedOnCycleId: b.basedOnCycleId ?? null,
      decidedByUserId: auth.userId,
    });
    return id;
  }

  function subjectError(b: z.infer<typeof subjectPair>): { code: number; error: string; subjects?: string[] } | null {
    const bad = [b.primarySubject, b.backupSubject].filter((s) => !isDomain(s));
    if (bad.length) return { code: 422, error: 'unknown_subject', subjects: bad };
    if (b.primarySubject === b.backupSubject) return { code: 422, error: 'primary_equals_backup' };
    return null;
  }

  // Chốt lần đầu. Chỉ cho phép SAU khi trẻ đã hoàn thành >= 1 chu kỳ trải nghiệm.
  app.post('/specialisation/choices', parent, async (req, reply) => {
    const body = z.object({ childId: z.string(), ...subjectPairShape }).parse(req.body);
    const auth = req.auth!;
    const child = await loadChildForFamily(body.childId, auth, reply);
    if (!child) return;

    const se = subjectError(body);
    if (se) return reply.code(se.code).send({ error: se.error, subjects: se.subjects });

    const completed = await db
      .select({ id: explorationCycle.id })
      .from(explorationCycle)
      .where(
        and(eq(explorationCycle.childProfileId, body.childId), eq(explorationCycle.status, 'COMPLETED')),
      );
    if (!completed[0]) {
      return reply.code(409).send({
        error: 'need_completed_cycle',
        message: 'Chốt môn chuyên cần ít nhất một chu kỳ trải nghiệm đã hoàn thành — không chốt bằng một bài test.',
      });
    }
    if (await activeChoice(body.childId)) {
      return reply.code(409).send({ error: 'choice_exists', message: 'Đã có lựa chọn đang hiệu lực — dùng PUT để đổi.' });
    }
    if (body.basedOnCycleId && !completed.some((c) => c.id === body.basedOnCycleId)) {
      return reply.code(422).send({ error: 'bad_cycle' });
    }

    const id = await insertChoice(body.childId, child.familyId, auth, body);
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'specialisation_choice.created',
      resourceType: 'specialisation_choice',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { childId: body.childId, primary: body.primarySubject, backup: body.backupSubject },
    });
    return reply.code(201).send({ id, status: 'ACTIVE' });
  });

  // Đổi lựa chọn -> supersede (giữ lịch sử). Dễ đổi: không khóa cứng.
  app.put('/specialisation/choices/:id', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = subjectPair.parse(req.body);
    const auth = req.auth!;
    const rows = await db.select().from(specialisationChoice).where(eq(specialisationChoice.id, id));
    const cur = rows[0];
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, cur.familyId)) return;
    if (cur.status !== 'ACTIVE') return reply.code(409).send({ error: 'not_active', status: cur.status });

    const se = subjectError(body);
    if (se) return reply.code(se.code).send({ error: se.error, subjects: se.subjects });

    const newIdStr = await insertChoice(cur.childProfileId, cur.familyId, auth, body);
    await db
      .update(specialisationChoice)
      .set({ status: 'SUPERSEDED', supersededById: newIdStr, endedAt: new Date() })
      .where(eq(specialisationChoice.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'specialisation_choice.revised',
      resourceType: 'specialisation_choice',
      resourceId: newIdStr,
      familyId: auth.familyId,
      metadata: { supersededId: id, primary: body.primarySubject, backup: body.backupSubject },
    });
    return { id: newIdStr, status: 'ACTIVE', supersededId: id };
  });

  // Rút lại hẳn — quay về giai đoạn khám phá.
  app.post('/specialisation/choices/:id/withdraw', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const rows = await db.select().from(specialisationChoice).where(eq(specialisationChoice.id, id));
    const cur = rows[0];
    if (!cur) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, cur.familyId)) return;
    if (cur.status !== 'ACTIVE') return reply.code(409).send({ error: 'not_active', status: cur.status });
    await db
      .update(specialisationChoice)
      .set({ status: 'WITHDRAWN', endedAt: new Date() })
      .where(eq(specialisationChoice.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'specialisation_choice.withdrawn',
      resourceType: 'specialisation_choice',
      resourceId: id,
      familyId: auth.familyId,
    });
    return { id, status: 'WITHDRAWN' };
  });

  // Lựa chọn hiện tại + lịch sử + kế hoạch chiều sâu — PIN-gated. KHÔNG dự báo "đậu/rớt".
  app.get('/children/:id/specialisation-choice', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const child = await loadChildForFamily(id, auth, reply);
    if (!child) return;

    const all = await db
      .select()
      .from(specialisationChoice)
      .where(eq(specialisationChoice.childProfileId, id));
    all.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime());
    const current = all.find((c) => c.status === 'ACTIVE') ?? null;
    const depthPlan = current
      ? await buildDepthPlan(db, id, current.primarySubject, current.backupSubject)
      : null;

    return {
      childId: id,
      current,
      history: all,
      depthPlan,
      disclaimer: SPEC_CHOICE_DISCLAIMER,
    };
  });
}
