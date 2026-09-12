import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, desc, eq, inArray, ne } from 'drizzle-orm';
// @ts-expect-error - JS module không có type declaration
import { validateContentDoc } from '@tiny/content-schema';
import type { Database } from '../db/client.js';
import type { Guards } from '../auth/context.js';
import {
  contentPack,
  learningUnit,
  learningUnitSkill,
  learningUnitOutcome,
  contentReview,
  contentImportJob,
  skill,
} from '../db/schema.js';
import { randomBytes } from 'node:crypto';
import { csvToPacks } from '../content/csv.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';

/** id đơn vị hợp lệ theo slugId của content-schema (không dấu gạch dưới). */
const slugUnitId = () => `u-${randomBytes(9).toString('hex')}`;

type Finding = { rule_id: string; severity: 'ERROR' | 'WARN'; path: string; message: string };

/** Hình dạng lỏng của một unit thô do author gửi (đã qua validateContentDoc). */
interface RawUnit {
  title?: string;
  locale?: string;
  stage?: string;
  schema_version?: string;
  content_version?: string;
  grades?: number[];
  domains?: string[];
  duration_minutes?: { screen?: number; offline?: number };
  materials?: string[];
  choices?: Array<{ id: string; label: string }>;
  quest_flow?: Record<string, unknown>;
  hints?: Array<Record<string, unknown>>;
  evidence?: string[];
  rubric_id?: string;
  adaptations?: Record<string, unknown>;
  safety?: { adult_required?: boolean; risk_level?: string };
  skills?: Array<{ skill_id: string; role: string }>;
  learning_outcomes?: Array<{ framework?: string; code?: string | null; description?: string }>;
}

const packDoc = z
  .object({
    id: z.string().optional(),
    kind: z.literal('CONTENT_PACK'),
    schema_version: z.string(),
    content_version: z.string(),
    title: z.string().min(1).max(160),
    description: z.string().max(2000).optional(),
    locale: z.string(),
    stage: z.string(),
    grades: z.array(z.number().int()),
    code: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120).optional(),
    provenance: z.object({
      author: z.string().min(1),
      reviewer: z.string().optional(),
      source_refs: z.array(z.unknown()).optional(),
      license: z.string(),
    }),
    units: z.array(z.record(z.unknown())).min(1).max(50),
  })
  .passthrough();

export function registerStudioRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
  const parent = { preHandler: guards.requireParent };
  const pinned = { preHandler: guards.requirePinVerified };

  async function loadOwned(reply: FastifyReply, familyId: string | null, id: string) {
    const rows = await db.select().from(contentPack).where(eq(contentPack.id, id));
    const p = rows[0];
    if (!p || p.origin !== 'STUDIO' || p.familyId !== familyId) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    return p;
  }

  async function assertKnownSkills(units: Array<Record<string, unknown>>) {
    const codes = [
      ...new Set(
        units.flatMap((u) =>
          ((u.skills ?? []) as Array<{ skill_id?: string }>).map((s) => s.skill_id).filter(Boolean),
        ),
      ),
    ] as string[];
    if (codes.length === 0) return;
    const known = new Set(
      (await db.select({ code: skill.code }).from(skill).where(inArray(skill.code, codes))).map((r) => r.code),
    );
    const unknown = codes.filter((c) => !known.has(c));
    if (unknown.length) {
      throw Object.assign(new Error('unknown_skill'), { statusCode: 422, unknownSkills: unknown });
    }
  }

  async function writeUnits(packId: string, stage: string, units: Array<Record<string, unknown>>) {
    await assertKnownSkills(units);
    await db.delete(learningUnit).where(eq(learningUnit.packId, packId));
    for (let i = 0; i < units.length; i++) {
      const u = units[i] as RawUnit;
      const unitId = slugUnitId();
      await db.insert(learningUnit).values({
        id: unitId,
        packId,
        title: String(u.title ?? `Nhiệm vụ ${i + 1}`),
        locale: String(u.locale ?? 'vi-VN'),
        stage: String(u.stage ?? stage),
        status: 'DRAFT',
        schemaVersion: String(u.schema_version ?? '1.0.0'),
        contentVersion: String(u.content_version ?? '1.0.0'),
        grades: (u.grades ?? []) as number[],
        domains: (u.domains ?? []) as string[],
        durationScreenMin: Number(u.duration_minutes?.screen ?? 0),
        durationOfflineMin: Number(u.duration_minutes?.offline ?? 0),
        materials: (u.materials ?? null) as string[] | null,
        choices: (u.choices ?? []) as Array<{ id: string; label: string }>,
        questFlow: (u.quest_flow ?? {}) as Record<string, unknown>,
        hints: (u.hints ?? []) as Array<Record<string, unknown>>,
        evidence: (u.evidence ?? []) as string[],
        rubricId: (u.rubric_id ?? null) as string | null,
        adaptations: (u.adaptations ?? null) as Record<string, unknown> | null,
        safetyAdultRequired: !!u.safety?.adult_required,
        safetyRiskLevel: String(u.safety?.risk_level ?? 'LOW'),
      });
      for (const s of (u.skills ?? []) as Array<{ skill_id: string; role: string }>) {
        await db.insert(learningUnitSkill).values({ unitId, skillId: s.skill_id, role: s.role });
      }
      const outcomes = u.learning_outcomes ?? [];
      for (let j = 0; j < outcomes.length; j++) {
        await db.insert(learningUnitOutcome).values({
          id: `${unitId}:${j}`,
          unitId,
          framework: String(outcomes[j]!.framework ?? 'VN_GDPT'),
          code: outcomes[j]!.code ?? null,
          description: String(outcomes[j]!.description ?? ''),
        });
      }
    }
  }

  /** Tạo một pack DRAFT từ doc thô. Ném lỗi {statusCode:422, findings} nếu validation ERROR. */
  async function createDraftPack(
    auth: { userId: string; role: string; familyId: string | null },
    rawPack: z.infer<typeof packDoc>,
    aiGenerated: boolean,
  ): Promise<{ id: string; code: string; warnings: Finding[] }> {
    const packId = newId('spk');
    const code = rawPack.code ?? rawPack.id ?? slug(rawPack.title);
    // Schema pack không cho phép trường lạ (vd `code`) -> chỉ giữ `id`.
    const { code: _c, ...clean } = rawPack;
    void _c;
    const { ok, findings } = (await validateContentDoc({ ...clean, id: code, status: 'DRAFT' })) as {
      ok: boolean;
      findings: Finding[];
    };
    if (!ok) {
      throw Object.assign(new Error('validation_failed'), {
        statusCode: 422,
        findings: findings.filter((f) => f.severity === 'ERROR'),
      });
    }
    await assertKnownSkills(rawPack.units as Array<Record<string, unknown>>);
    await db.insert(contentPack).values({
      id: packId,
      code,
      kind: 'CONTENT_PACK',
      schemaVersion: rawPack.schema_version,
      contentVersion: rawPack.content_version,
      status: 'DRAFT',
      origin: 'STUDIO',
      familyId: auth.familyId,
      aiGenerated,
      createdByUserId: auth.userId,
      title: rawPack.title,
      description: rawPack.description ?? null,
      locale: rawPack.locale,
      stage: rawPack.stage,
      grades: rawPack.grades,
      provenanceAuthor: rawPack.provenance.author,
      provenanceReviewer: rawPack.provenance.reviewer ?? null,
      provenanceSourceRefs: rawPack.provenance.source_refs ?? null,
      license: rawPack.provenance.license,
    });
    await writeUnits(packId, rawPack.stage, rawPack.units);
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'content_pack.created',
      resourceType: 'content_pack',
      resourceId: packId,
      familyId: auth.familyId,
      metadata: { aiGenerated },
    });
    return { id: packId, code, warnings: findings.filter((f) => f.severity === 'WARN') };
  }

  // ── Tạo pack DRAFT ──
  app.post('/studio/packs', parent, async (req, reply) => {
    const body = z.object({ pack: packDoc, aiGenerated: z.boolean().optional() }).parse(req.body);
    try {
      const r = await createDraftPack(req.auth!, body.pack, body.aiGenerated ?? false);
      return reply.code(201).send(r);
    } catch (e) {
      const err = e as { statusCode?: number; findings?: Finding[]; message?: string; unknownSkills?: string[] };
      if (err.unknownSkills) return reply.code(422).send({ error: 'unknown_skill', unknownSkills: err.unknownSkills });
      if (err.statusCode === 422) return reply.code(422).send({ error: 'validation_failed', findings: err.findings });
      throw e;
    }
  });

  // ── Import CSV / JSON (nhiều pack một lần) ──
  app.post('/studio/imports', parent, async (req, reply) => {
    const body = z
      .object({
        format: z.enum(['JSON', 'CSV']),
        content: z.string().min(1).max(2_000_000),
        aiGenerated: z.boolean().optional(),
      })
      .parse(req.body);
    const auth = req.auth!;

    let candidates: Array<{ doc: Record<string, unknown>; rows: number[] }> = [];
    const errorReport: Array<{ row: number; errors: string[] }> = [];

    if (body.format === 'JSON') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(body.content);
      } catch (e) {
        return reply.code(400).send({ error: 'invalid_json', detail: (e as Error).message });
      }
      const docs = Array.isArray(parsed) ? parsed : [parsed];
      candidates = docs.map((d, i) => ({ doc: d as Record<string, unknown>, rows: [i + 1] }));
    } else {
      const built = csvToPacks(body.content);
      candidates = built.packs;
      errorReport.push(...built.errors);
    }

    const createdPackIds: string[] = [];
    let validCount = 0;
    for (const c of candidates) {
      const parsedPack = packDoc.safeParse(c.doc);
      if (!parsedPack.success) {
        errorReport.push({ row: c.rows[0] ?? 0, errors: parsedPack.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
        continue;
      }
      try {
        const r = await createDraftPack(auth, parsedPack.data, body.aiGenerated ?? false);
        createdPackIds.push(r.id);
        validCount += 1;
      } catch (e) {
        const err = e as { statusCode?: number; findings?: Finding[] };
        errorReport.push({
          row: c.rows[0] ?? 0,
          errors: (err.findings ?? [{ message: (e as Error).message }]).map(
            (f) => `${(f as Finding).rule_id ?? ''} ${f.message}`.trim(),
          ),
        });
      }
    }

    const jobId = newId('imp');
    await db.insert(contentImportJob).values({
      id: jobId,
      uploadedByUserId: auth.userId,
      familyId: auth.familyId,
      format: body.format,
      status: 'DONE',
      rowCount: candidates.reduce((n, c) => n + c.rows.length, 0) + errorReport.filter((e) => e.row === 0).length,
      validCount,
      createdPackIds,
      errorReport,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'content_import.run',
      resourceType: 'content_import_job',
      resourceId: jobId,
      familyId: auth.familyId,
      metadata: { format: body.format, validCount, rejected: errorReport.length },
    });

    return reply.code(201).send({ jobId, validCount, createdPackIds, errorReport });
  });

  app.get('/studio/imports/:id', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const rows = await db.select().from(contentImportJob).where(eq(contentImportJob.id, id));
    const job = rows[0];
    if (!job || job.familyId !== req.auth!.familyId) return reply.code(404).send({ error: 'not_found' });
    return job;
  });

  // ── Sửa nội dung một DRAFT ──
  app.put('/studio/packs/:id', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ pack: packDoc }).parse(req.body);
    const auth = req.auth!;
    const p = await loadOwned(reply, auth.familyId, id);
    if (!p) return;
    if (p.status !== 'DRAFT') return reply.code(409).send({ error: 'not_draft' });

    const { ok, findings } = (await validateContentDoc({
      ...body.pack,
      id: p.code ?? body.pack.code ?? slug(body.pack.title),
      status: 'DRAFT',
    })) as { ok: boolean; findings: Finding[] };
    if (!ok) {
      return reply.code(422).send({ error: 'validation_failed', findings: findings.filter((f) => f.severity === 'ERROR') });
    }
    try {
      await assertKnownSkills(body.pack.units as Array<Record<string, unknown>>);
    } catch (e) {
      const err = e as { unknownSkills?: string[] };
      if (err.unknownSkills) return reply.code(422).send({ error: 'unknown_skill', unknownSkills: err.unknownSkills });
      throw e;
    }

    await db
      .update(contentPack)
      .set({
        title: body.pack.title,
        description: body.pack.description ?? null,
        stage: body.pack.stage,
        grades: body.pack.grades,
        contentVersion: body.pack.content_version,
        provenanceAuthor: body.pack.provenance.author,
        license: body.pack.provenance.license,
        updatedAt: new Date(),
      })
      .where(eq(contentPack.id, id));
    await writeUnits(id, body.pack.stage, body.pack.units);
    return { ok: true, warnings: findings.filter((f) => f.severity === 'WARN') };
  });

  app.post('/studio/packs/:id/validate', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = await loadOwned(reply, req.auth!.familyId, id);
    if (!p) return;
    const doc = await reconstructDoc(db, p);
    const { ok, findings } = (await validateContentDoc(doc)) as { ok: boolean; findings: Finding[] };
    return { ok, findings };
  });

  app.post('/studio/packs/:id/submit', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const p = await loadOwned(reply, auth.familyId, id);
    if (!p) return;
    if (p.status !== 'DRAFT') return reply.code(409).send({ error: 'not_draft' });

    const { ok } = (await validateContentDoc(await reconstructDoc(db, p))) as { ok: boolean };
    if (!ok) return reply.code(422).send({ error: 'validation_failed' });

    await db
      .update(contentPack)
      .set({ status: 'IN_REVIEW', submittedByUserId: auth.userId, submittedAt: new Date(), updatedAt: new Date() })
      .where(eq(contentPack.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'content_pack.submitted',
      resourceType: 'content_pack',
      resourceId: id,
      familyId: auth.familyId,
    });
    return { ok: true, status: 'IN_REVIEW' };
  });

  // ── Duyệt & xuất bản (yêu cầu PIN) ──
  app.post('/studio/packs/:id/approve', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ note: z.string().max(500).optional() }).parse(req.body ?? {});
    const auth = req.auth!;
    const p = await loadOwned(reply, auth.familyId, id);
    if (!p) return;
    if (p.status !== 'IN_REVIEW') return reply.code(409).send({ error: 'not_in_review' });

    // Validate lần cuối trước khi cho trẻ thấy.
    const { ok } = (await validateContentDoc(await reconstructDoc(db, p))) as { ok: boolean };
    if (!ok) return reply.code(422).send({ error: 'validation_failed' });

    const selfReview = p.submittedByUserId === auth.userId;

    await db.insert(contentReview).values({
      id: newId('crv'),
      packId: id,
      reviewerUserId: auth.userId,
      decision: 'APPROVE',
      note: body.note ?? null,
      selfReview,
    });

    // Supersede pack cùng code đang PUBLISHED.
    if (p.code) {
      await db
        .update(contentPack)
        .set({ status: 'SUPERSEDED', supersededBy: id, updatedAt: new Date() })
        .where(and(eq(contentPack.code, p.code), eq(contentPack.status, 'PUBLISHED'), ne(contentPack.id, id)));
    }

    await db
      .update(contentPack)
      .set({
        status: 'PUBLISHED',
        reviewedByUserId: auth.userId,
        reviewNote: body.note ?? null,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(contentPack.id, id));
    await db.update(learningUnit).set({ status: 'PUBLISHED' }).where(eq(learningUnit.packId, id));

    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'content_pack.published',
      resourceType: 'content_pack',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { selfReview, aiGenerated: p.aiGenerated },
    });
    return { ok: true, status: 'PUBLISHED', selfReview };
  });

  app.post('/studio/packs/:id/reject', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ note: z.string().min(1).max(500) }).parse(req.body);
    const auth = req.auth!;
    const p = await loadOwned(reply, auth.familyId, id);
    if (!p) return;
    if (p.status !== 'IN_REVIEW') return reply.code(409).send({ error: 'not_in_review' });

    await db.insert(contentReview).values({
      id: newId('crv'),
      packId: id,
      reviewerUserId: auth.userId,
      decision: 'REJECT',
      note: body.note,
      selfReview: p.submittedByUserId === auth.userId,
    });
    await db
      .update(contentPack)
      .set({ status: 'DRAFT', reviewNote: body.note, updatedAt: new Date() })
      .where(eq(contentPack.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'content_pack.rejected',
      resourceType: 'content_pack',
      resourceId: id,
      familyId: auth.familyId,
    });
    return { ok: true, status: 'DRAFT' };
  });

  app.post('/studio/packs/:id/withdraw', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const p = await loadOwned(reply, auth.familyId, id);
    if (!p) return;
    if (p.status !== 'PUBLISHED') return reply.code(409).send({ error: 'not_published' });
    await db.update(contentPack).set({ status: 'WITHDRAWN', updatedAt: new Date() }).where(eq(contentPack.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'content_pack.withdrawn',
      resourceType: 'content_pack',
      resourceId: id,
      familyId: auth.familyId,
    });
    return { ok: true, status: 'WITHDRAWN' };
  });

  app.get('/studio/packs', parent, async (req) => {
    const rows = await db
      .select()
      .from(contentPack)
      .where(and(eq(contentPack.origin, 'STUDIO'), eq(contentPack.familyId, req.auth!.familyId ?? '__none__')))
      .orderBy(desc(contentPack.updatedAt));
    return { packs: rows };
  });

  app.get('/studio/packs/:id', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = await loadOwned(reply, req.auth!.familyId, id);
    if (!p) return;
    const units = await db.select().from(learningUnit).where(eq(learningUnit.packId, id));
    const reviews = await db.select().from(contentReview).where(eq(contentReview.packId, id)).orderBy(desc(contentReview.createdAt));
    return { pack: p, units, reviews };
  });

  // Xem trước giao diện trẻ (bất kể trạng thái).
  app.get('/studio/packs/:id/preview', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = await loadOwned(reply, req.auth!.familyId, id);
    if (!p) return;
    const units = await db.select().from(learningUnit).where(eq(learningUnit.packId, id));
    return {
      title: p.title,
      stage: p.stage,
      units: units.map((u) => ({
        id: u.id,
        title: u.title,
        hook: (u.questFlow as { hook?: string }).hook ?? null,
        choices: u.choices,
        planPrompt: (u.questFlow as { plan_prompt?: string }).plan_prompt ?? null,
        reflectionPrompt: (u.questFlow as { reflection_prompt?: string }).reflection_prompt ?? null,
        hintLevels: (u.hints as Array<{ level: number }>).map((h) => h.level).sort((a, b) => a - b),
      })),
    };
  });
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 100) || `pack-${Date.now().toString(36)}`
  );
}

/** Dựng lại doc ContentPack từ DB để validate. */
async function reconstructDoc(db: Database, p: typeof contentPack.$inferSelect): Promise<Record<string, unknown>> {
  const units = await db.select().from(learningUnit).where(eq(learningUnit.packId, p.id));
  const skillsByUnit = new Map<string, Array<{ skill_id: string; role: string }>>();
  const outByUnit = new Map<string, Array<{ framework: string; description: string; code?: string }>>();
  for (const u of units) {
    skillsByUnit.set(
      u.id,
      (await db.select().from(learningUnitSkill).where(eq(learningUnitSkill.unitId, u.id))).map((s) => ({
        skill_id: s.skillId,
        role: s.role,
      })),
    );
    outByUnit.set(
      u.id,
      (await db.select().from(learningUnitOutcome).where(eq(learningUnitOutcome.unitId, u.id))).map((o) => ({
        framework: o.framework,
        description: o.description,
        ...(o.code ? { code: o.code } : {}),
      })),
    );
  }
  return {
    id: p.code ?? p.id,
    kind: 'CONTENT_PACK',
    schema_version: p.schemaVersion,
    content_version: p.contentVersion,
    status: p.status,
    title: p.title,
    locale: p.locale,
    stage: p.stage,
    grades: p.grades,
    provenance: { author: p.provenanceAuthor, license: p.license },
    units: units.map((u) => ({
      id: u.id,
      schema_version: u.schemaVersion,
      content_version: u.contentVersion,
      status: 'DRAFT',
      title: u.title,
      locale: u.locale,
      stage: u.stage,
      grades: u.grades,
      domains: u.domains,
      learning_outcomes: outByUnit.get(u.id) ?? [],
      skills: skillsByUnit.get(u.id) ?? [],
      duration_minutes: { screen: u.durationScreenMin, offline: u.durationOfflineMin },
      choices: u.choices,
      quest_flow: u.questFlow,
      hints: u.hints,
      evidence: u.evidence,
      adaptations: u.adaptations ?? {},
      safety: { adult_required: u.safetyAdultRequired, risk_level: u.safetyRiskLevel },
      provenance: { author: p.provenanceAuthor, license: p.license },
    })),
  };
}
