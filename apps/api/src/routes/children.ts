import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { Guards } from '../auth/context.js';
import { CHILD_COOKIE, assertFamilyAccess } from '../auth/context.js';
import { childProfile, childInterest, childGoal, consent } from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import { openChildSession, revokeSession, CHILD_SESSION_TTL_MS } from '../auth/service.js';
import { issueCsrf } from '../auth/csrf.js';

interface Opts {
  isProd: boolean;
}

const createBody = z.object({
  displayName: z.string().min(1).max(80),
  birthMonth: z.number().int().min(1).max(12),
  birthYear: z.number().int().min(2000).max(2100),
  screenSessionMinutes: z.number().int().min(3).max(60).optional(),
  interests: z
    .array(
      z.object({
        source: z.enum(['CHILD', 'PARENT']),
        label: z.string().min(1).max(80),
        strength: z.enum(['EMERGING', 'STEADY', 'STRONG']).optional(),
      }),
    )
    .max(20)
    .optional(),
  goals: z
    .array(z.object({ setBy: z.enum(['PARENT', 'TEACHER']), description: z.string().min(1).max(300) }))
    .max(20)
    .optional(),
  consents: z
    .object({ voiceRecording: z.boolean().optional(), imageUpload: z.boolean().optional() })
    .optional(),
});

export function registerChildrenRoutes(app: FastifyInstance, db: Database, guards: Guards, opts: Opts): void {
  // MVP bước 1: phụ huynh tạo hồ sơ trẻ tối thiểu + cấu hình thời lượng + consent cơ bản.
  app.post('/children', { preHandler: guards.requireParent }, async (req, reply) => {
    const body = createBody.parse(req.body);
    const auth = req.auth!;
    if (!auth.familyId) return reply.code(403).send({ error: 'no_family' });

    const childId = newId('chd');
    await db.insert(childProfile).values({
      id: childId,
      familyId: auth.familyId,
      displayName: body.displayName,
      birthMonth: body.birthMonth,
      birthYear: body.birthYear,
      screenSessionMinutes: body.screenSessionMinutes ?? 10,
    });

    for (const it of body.interests ?? []) {
      await db.insert(childInterest).values({
        id: newId('int'),
        childProfileId: childId,
        source: it.source,
        label: it.label,
        strength: it.strength ?? 'EMERGING',
      });
    }
    for (const g of body.goals ?? []) {
      await db.insert(childGoal).values({
        id: newId('gol'),
        childProfileId: childId,
        setBy: g.setBy,
        description: g.description,
      });
    }

    // DATA_PROCESSING luôn bắt buộc; voice/image tùy chọn.
    const consentTypes = ['DATA_PROCESSING'];
    if (body.consents?.voiceRecording) consentTypes.push('VOICE_RECORDING');
    if (body.consents?.imageUpload) consentTypes.push('IMAGE_UPLOAD');
    for (const type of consentTypes) {
      await db.insert(consent).values({
        id: newId('cns'),
        familyId: auth.familyId,
        childProfileId: childId,
        type,
        grantedByUserId: auth.userId,
      });
    }

    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'child_profile.created',
      resourceType: 'child_profile',
      resourceId: childId,
      familyId: auth.familyId,
      metadata: { consentTypes },
    });

    return reply.code(201).send({ id: childId });
  });

  app.get('/children', { preHandler: guards.requireParent }, async (req) => {
    const auth = req.auth!;
    const rows = await db
      .select()
      .from(childProfile)
      .where(eq(childProfile.familyId, auth.familyId ?? '__none__'));
    return { children: rows };
  });

  app.get('/children/:id', { preHandler: guards.requireParent }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const child = rows[0];
    if (!child) return reply.code(404).send({ error: 'not_found' });
    // Object-level authz: khác family -> 404 (không lộ tồn tại). Chống IDOR/BOLA.
    if (!assertFamilyAccess(reply, auth, child.familyId)) return;

    const interests = await db
      .select()
      .from(childInterest)
      .where(eq(childInterest.childProfileId, id));
    const goals = await db.select().from(childGoal).where(eq(childGoal.childProfileId, id));
    return { child, interests, goals };
  });

  app.patch('/children/:id', { preHandler: guards.requireParent }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        displayName: z.string().min(1).max(80).optional(),
        screenSessionMinutes: z.number().int().min(3).max(60).optional(),
        currentStage: z.string().optional(),
      })
      .parse(req.body);
    const auth = req.auth!;

    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const child = rows[0];
    if (!child) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, child.familyId)) return;

    await db
      .update(childProfile)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(childProfile.id, id));
    return { ok: true };
  });

  // Phụ huynh mở phiên học cho trẻ trên thiết bị này (MVP bước hướng tới Choose).
  app.post('/children/:id/child-session', { preHandler: guards.requireParent }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const child = rows[0];
    if (!child) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, child.familyId)) return;

    const issued = await openChildSession(
      db,
      { userId: auth.userId, sessionId: auth.sessionId, role: auth.role, familyId: auth.familyId },
      id,
    );
    reply.setCookie(CHILD_COOKIE, issued.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: opts.isProd,
      path: '/',
      maxAge: Math.floor(CHILD_SESSION_TTL_MS / 1000),
    });
    issueCsrf(reply, opts.isProd);

    // Ngữ cảnh KHÔNG chứa PII (tuổi tính sẵn, không ngày sinh) để client tính hint/nghỉ đúng.
    const now = new Date();
    let ageYears = now.getUTCFullYear() - child.birthYear;
    if (now.getUTCMonth() + 1 < child.birthMonth) ageYears -= 1;
    return reply.code(201).send({
      token: issued.token,
      expiresAt: issued.expiresAt,
      childProfileId: id,
      childContext: {
        ageYears: Math.max(3, Math.min(18, ageYears)),
        screenSessionMinutes: child.screenSessionMinutes,
        stage: child.currentStage,
      },
    });
  });

  /** Kết thúc phiên trẻ trên thiết bị này -> phiên phụ huynh (cookie tiny_session) lại có hiệu lực. */
  app.post('/child-session/end', { preHandler: guards.requireAuth }, async (req, reply) => {
    const auth = req.auth!;
    if (auth.kind === 'CHILD') {
      await revokeSession(db, auth.sessionId);
      await writeAudit(db, {
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: 'child_session.ended',
        resourceType: 'child_profile',
        resourceId: auth.childProfileId,
        familyId: auth.familyId,
      });
    }
    reply.clearCookie(CHILD_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

}
