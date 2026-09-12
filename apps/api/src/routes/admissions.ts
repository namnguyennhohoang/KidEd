import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, inArray, isNull, lt, ne, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { AuthContext, Guards } from '../auth/context.js';
import { admissionRule, targetOverlay } from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import { assessStaleness, diffRules } from '../learning/admissions.js';

const PATHWAY_CODES = ['US', 'UK', 'SG', 'CA', 'AU'] as const;

const ruleBody = z.object({
  targetOverlayCode: z.enum(['TDN_GRADE_6', 'TDN_SPECIALIZED_GRADE_10', 'GLOBAL_TOP_UNIVERSITY']).optional(),
  pathwayCode: z.enum(PATHWAY_CODES).optional(),
  institutionCode: z.string().min(1).max(80),
  institutionName: z.string().min(1).max(200),
  admissionYear: z.number().int().min(2000).max(2100),
  effectiveDate: z.string().datetime().optional(),
  sourceUrl: z.string().url().optional(),
  sourceCheckedDate: z.string().datetime().optional(),
  reviewByDate: z.string().datetime().optional(),
  eligibility: z.record(z.unknown()).optional(),
  examOrPortfolioStructure: z.record(z.unknown()).optional(),
  subjects: z.array(z.unknown()).optional(),
  durationInfo: z.record(z.unknown()).optional(),
  scoringMethod: z.record(z.unknown()).optional(),
  cutoff: z.record(z.unknown()).optional(),
  notes: z.string().max(4000).optional(),
});

export function registerAdmissionsRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
  const parent = { preHandler: guards.requireParent };
  const pinned = { preHandler: guards.requirePinVerified };

  /** Quy chế thấy được: của family mình + platform (family_id null). */
  function visibleTo(a: AuthContext) {
    return or(isNull(admissionRule.familyId), eq(admissionRule.familyId, a.familyId ?? '__none__'));
  }

  async function loadVisible(reply: FastifyReply, a: AuthContext, id: string) {
    const rows = await db.select().from(admissionRule).where(eq(admissionRule.id, id));
    const r = rows[0];
    if (!r || (r.familyId !== null && r.familyId !== a.familyId)) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    return r;
  }

  async function overlayId(code?: string): Promise<string | null> {
    if (!code) return null;
    const rows = await db.select({ id: targetOverlay.id }).from(targetOverlay).where(eq(targetOverlay.code, code));
    return rows[0]?.id ?? null;
  }

  app.get('/admissions/overlays', parent, async () => {
    return { overlays: await db.select().from(targetOverlay).orderBy(asc(targetOverlay.code)) };
  });

  app.post('/admissions/rules', parent, async (req, reply) => {
    const b = ruleBody.parse(req.body);
    const auth = req.auth!;
    if (b.pathwayCode && b.targetOverlayCode !== 'GLOBAL_TOP_UNIVERSITY') {
      return reply.code(422).send({ error: 'pathway_needs_global_overlay' });
    }
    const id = newId('adr');
    await db.insert(admissionRule).values({
      id,
      familyId: auth.familyId,
      targetOverlayId: await overlayId(b.targetOverlayCode),
      pathwayCode: b.pathwayCode ?? null,
      institutionCode: b.institutionCode,
      institutionName: b.institutionName,
      admissionYear: b.admissionYear,
      effectiveDate: b.effectiveDate ? new Date(b.effectiveDate) : null,
      sourceUrl: b.sourceUrl ?? null,
      sourceCheckedDate: b.sourceCheckedDate ? new Date(b.sourceCheckedDate) : null,
      reviewByDate: b.reviewByDate ? new Date(b.reviewByDate) : null,
      eligibility: b.eligibility ?? null,
      examOrPortfolioStructure: b.examOrPortfolioStructure ?? null,
      subjects: b.subjects ?? null,
      durationInfo: b.durationInfo ?? null,
      scoringMethod: b.scoringMethod ?? null,
      cutoff: b.cutoff ?? null,
      notes: b.notes ?? null,
      status: 'DRAFT',
      createdByUserId: auth.userId,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'admission_rule.created',
      resourceType: 'admission_rule',
      resourceId: id,
      familyId: auth.familyId,
    });
    return reply.code(201).send({ id });
  });

  app.put('/admissions/rules/:id', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const b = ruleBody.partial().parse(req.body);
    const auth = req.auth!;
    const r = await loadVisible(reply, auth, id);
    if (!r) return;
    if (r.familyId !== auth.familyId) return reply.code(403).send({ error: 'not_owner' });
    if (r.status !== 'DRAFT') return reply.code(409).send({ error: 'not_draft' });

    await db
      .update(admissionRule)
      .set({
        ...(b.institutionCode !== undefined ? { institutionCode: b.institutionCode } : {}),
        ...(b.institutionName !== undefined ? { institutionName: b.institutionName } : {}),
        ...(b.admissionYear !== undefined ? { admissionYear: b.admissionYear } : {}),
        ...(b.pathwayCode !== undefined ? { pathwayCode: b.pathwayCode } : {}),
        ...(b.effectiveDate !== undefined ? { effectiveDate: new Date(b.effectiveDate) } : {}),
        ...(b.sourceUrl !== undefined ? { sourceUrl: b.sourceUrl } : {}),
        ...(b.sourceCheckedDate !== undefined ? { sourceCheckedDate: new Date(b.sourceCheckedDate) } : {}),
        ...(b.reviewByDate !== undefined ? { reviewByDate: new Date(b.reviewByDate) } : {}),
        ...(b.eligibility !== undefined ? { eligibility: b.eligibility } : {}),
        ...(b.examOrPortfolioStructure !== undefined ? { examOrPortfolioStructure: b.examOrPortfolioStructure } : {}),
        ...(b.subjects !== undefined ? { subjects: b.subjects } : {}),
        ...(b.durationInfo !== undefined ? { durationInfo: b.durationInfo } : {}),
        ...(b.scoringMethod !== undefined ? { scoringMethod: b.scoringMethod } : {}),
        ...(b.cutoff !== undefined ? { cutoff: b.cutoff } : {}),
        ...(b.notes !== undefined ? { notes: b.notes } : {}),
        updatedAt: new Date(),
      })
      .where(eq(admissionRule.id, id));
    return { ok: true };
  });

  // Xác minh: DRAFT -> VERIFIED. Bắt buộc có nguồn + ngày kiểm tra nguồn. Cần PIN.
  app.post('/admissions/rules/:id/verify', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const r = await loadVisible(reply, auth, id);
    if (!r) return;
    if (r.familyId !== auth.familyId) return reply.code(403).send({ error: 'not_owner' });
    if (r.status !== 'DRAFT') return reply.code(409).send({ error: 'not_draft' });
    if (!r.sourceUrl || !r.sourceCheckedDate) {
      return reply.code(422).send({ error: 'source_required', detail: 'cần source_url và source_checked_date' });
    }

    // Đưa các quy chế VERIFIED cũ hơn của cùng cơ sở (+overlay) về SUPERSEDED.
    await db
      .update(admissionRule)
      .set({ status: 'SUPERSEDED', supersededById: id, updatedAt: new Date() })
      .where(
        and(
          eq(admissionRule.institutionCode, r.institutionCode),
          eq(admissionRule.status, 'VERIFIED'),
          lt(admissionRule.admissionYear, r.admissionYear),
          ne(admissionRule.id, id),
          or(isNull(admissionRule.familyId), eq(admissionRule.familyId, auth.familyId ?? '__none__')),
        ),
      );

    await db
      .update(admissionRule)
      .set({ status: 'VERIFIED', verifiedByUserId: auth.userId, verifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(admissionRule.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'admission_rule.verified',
      resourceType: 'admission_rule',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { institutionCode: r.institutionCode, admissionYear: r.admissionYear },
    });
    return { ok: true, status: 'VERIFIED' };
  });

  app.post('/admissions/rules/:id/archive', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const r = await loadVisible(reply, auth, id);
    if (!r) return;
    if (r.familyId !== auth.familyId) return reply.code(403).send({ error: 'not_owner' });
    await db.update(admissionRule).set({ status: 'ARCHIVED', updatedAt: new Date() }).where(eq(admissionRule.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'admission_rule.archived',
      resourceType: 'admission_rule',
      resourceId: id,
      familyId: auth.familyId,
    });
    return { ok: true, status: 'ARCHIVED' };
  });

  app.get('/admissions/rules', parent, async (req) => {
    const q = z
      .object({
        institutionCode: z.string().optional(),
        year: z.coerce.number().int().optional(),
        status: z.string().optional(),
        overlay: z.string().optional(),
        pathway: z.string().optional(),
      })
      .parse(req.query);
    const conds = [visibleTo(req.auth!)];
    if (q.institutionCode) conds.push(eq(admissionRule.institutionCode, q.institutionCode));
    if (q.year) conds.push(eq(admissionRule.admissionYear, q.year));
    if (q.status) conds.push(eq(admissionRule.status, q.status));
    if (q.pathway) conds.push(eq(admissionRule.pathwayCode, q.pathway));
    if (q.overlay) {
      const oid = await overlayId(q.overlay);
      if (oid) conds.push(eq(admissionRule.targetOverlayId, oid));
    }
    const rows = await db
      .select()
      .from(admissionRule)
      .where(and(...conds))
      .orderBy(desc(admissionRule.admissionYear), asc(admissionRule.institutionCode));
    return {
      rules: rows.map((r) => ({ ...r, staleness: assessStaleness(r) })),
    };
  });

  app.get('/admissions/rules/:id', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const r = await loadVisible(reply, req.auth!, id);
    if (!r) return;
    return { rule: r, staleness: assessStaleness(r) };
  });

  // So sánh field-level giữa hai quy chế.
  app.get('/admissions/rules/:id/diff/:otherId', parent, async (req, reply) => {
    const { id, otherId } = z.object({ id: z.string(), otherId: z.string() }).parse(req.params);
    const a = await loadVisible(reply, req.auth!, id);
    if (!a) return;
    const b = await loadVisible(reply, req.auth!, otherId);
    if (!b) return;
    return {
      base: { id: a.id, year: a.admissionYear, status: a.status },
      other: { id: b.id, year: b.admissionYear, status: b.status },
      changes: diffRules(a, b),
    };
  });

  // Quy chế VERIFIED sắp/đã lỗi thời -> cần rà soát.
  app.get('/admissions/expiring', parent, async (req) => {
    const q = z.object({ withinDays: z.coerce.number().int().min(0).max(3650).default(120) }).parse(req.query);
    const rows = await db
      .select()
      .from(admissionRule)
      .where(and(visibleTo(req.auth!), inArray(admissionRule.status, ['VERIFIED', 'DRAFT'])));
    const now = new Date();
    const flagged = rows
      .map((r) => ({ rule: r, staleness: assessStaleness(r, now) }))
      .filter(
        (x) =>
          x.staleness.stale ||
          (x.staleness.daysUntilReview !== null && x.staleness.daysUntilReview <= q.withinDays),
      );
    return { count: flagged.length, items: flagged };
  });
}
