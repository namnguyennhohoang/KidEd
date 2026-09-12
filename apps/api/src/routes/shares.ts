import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { Guards } from '../auth/context.js';
import { assertFamilyAccess } from '../auth/context.js';
import { childProfile, educatorShare, explorationCycle, user } from '../db/schema.js';
import { newId, hashToken } from '../auth/crypto.js';
import { randomBytes } from 'node:crypto';
import { writeAudit } from '../audit.js';
import { buildDashboard } from '../learning/dashboard.js';
import { buildReadiness } from '../learning/readiness.js';
import { buildInterestProfile } from '../learning/specialisation.js';
import { buildScholarPortfolio } from '../learning/scholar.js';

export const SHARE_SECTIONS = ['dashboard', 'readiness', 'specialisation', 'scholar'] as const;
type Section = (typeof SHARE_SECTIONS)[number];

const scopeSchema = z.object({
  dashboard: z.boolean().optional(),
  readiness: z.boolean().optional(),
  specialisation: z.boolean().optional(),
  scholar: z.boolean().optional(),
});

export function registerShareRoutes(app: FastifyInstance, db: Database, guards: Guards): void {
  const parent = { preHandler: guards.requireParent };
  const pinned = { preHandler: guards.requirePinVerified };

  async function loadChild(id: string, req: FastifyRequest, reply: FastifyReply) {
    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const c = rows[0];
    if (!c) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (!assertFamilyAccess(reply, req.auth!, c.familyId)) return null;
    return c;
  }

  // ── Phụ huynh: tạo liên kết chỉ-đọc theo phạm vi (không cần tài khoản cho người xem) ──
  app.post('/children/:id/shares', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        role: z.enum(['TEACHER', 'MENTOR']),
        scope: scopeSchema,
        label: z.string().max(120).optional(),
        expiresDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(req.body);
    const auth = req.auth!;
    const child = await loadChild(id, req, reply);
    if (!child) return;
    const scope = {
      dashboard: !!body.scope.dashboard,
      readiness: !!body.scope.readiness,
      specialisation: !!body.scope.specialisation,
      scholar: !!body.scope.scholar,
    };
    if (!SHARE_SECTIONS.some((s) => scope[s])) {
      return reply.code(422).send({ error: 'empty_scope' });
    }

    const token = randomBytes(32).toString('base64url');
    const shareId = newId('shr');
    await db.insert(educatorShare).values({
      id: shareId,
      familyId: child.familyId,
      childProfileId: id,
      role: body.role,
      scope,
      label: body.label ?? null,
      mode: 'LINK',
      tokenHash: hashToken(token),
      status: 'ACTIVE',
      createdByUserId: auth.userId,
      expiresAt: body.expiresDays ? new Date(Date.now() + body.expiresDays * 86_400_000) : null,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'educator_share.created',
      resourceType: 'educator_share',
      resourceId: shareId,
      familyId: auth.familyId,
      metadata: { childId: id, role: body.role, mode: 'LINK' },
    });
    // Token chỉ trả về MỘT LẦN — DB chỉ giữ bản băm.
    return reply.code(201).send({ id: shareId, token, expiresAt: body.expiresDays ? new Date(Date.now() + body.expiresDays * 86_400_000).toISOString() : null });
  });

  app.get('/children/:id/shares', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const child = await loadChild(id, req, reply);
    if (!child) return;
    const rows = await db
      .select({
        id: educatorShare.id,
        role: educatorShare.role,
        scope: educatorShare.scope,
        label: educatorShare.label,
        mode: educatorShare.mode,
        status: educatorShare.status,
        createdAt: educatorShare.createdAt,
        expiresAt: educatorShare.expiresAt,
        lastAccessedAt: educatorShare.lastAccessedAt,
      })
      .from(educatorShare)
      .where(eq(educatorShare.childProfileId, id))
      .orderBy(desc(educatorShare.createdAt));
    return { shares: rows };
  });

  app.post('/shares/:id/revoke', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const auth = req.auth!;
    const rows = await db.select().from(educatorShare).where(eq(educatorShare.id, id));
    const s = rows[0];
    if (!s) return reply.code(404).send({ error: 'not_found' });
    if (!assertFamilyAccess(reply, auth, s.familyId)) return;
    await db.update(educatorShare).set({ status: 'REVOKED' }).where(eq(educatorShare.id, id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'educator_share.revoked',
      resourceType: 'educator_share',
      resourceId: id,
      familyId: auth.familyId,
    });
    return { id, status: 'REVOKED' };
  });

  // ── Người xem: chỉ-đọc bằng token (không phiên đăng nhập) ──
  async function resolveShare(req: FastifyRequest, reply: FastifyReply) {
    const token = z.string().min(10).max(200).safeParse(req.headers['x-share-token']);
    if (!token.success) {
      reply.code(401).send({ error: 'share_token_required' });
      return null;
    }
    const rows = await db
      .select()
      .from(educatorShare)
      .where(and(eq(educatorShare.tokenHash, hashToken(token.data)), eq(educatorShare.mode, 'LINK')));
    const s = rows[0];
    if (!s || s.status !== 'ACTIVE' || (s.expiresAt && s.expiresAt.getTime() < Date.now())) {
      reply.code(401).send({ error: 'share_invalid_or_expired' });
      return null;
    }
    return s;
  }

  function requireSection(section: Section) {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const s = await resolveShare(req, reply);
      if (!s) return;
      if (!s.scope?.[section]) {
        reply.code(403).send({ error: 'section_not_shared', section });
        return;
      }
      // Best-effort: đánh dấu lần truy cập gần nhất.
      void db.update(educatorShare).set({ lastAccessedAt: new Date() }).where(eq(educatorShare.id, s.id));
      (req as FastifyRequest & { share?: typeof s }).share = s;
    };
  }
  const share = (req: FastifyRequest) => (req as FastifyRequest & { share?: typeof educatorShare.$inferSelect }).share!;

  type Share = typeof educatorShare.$inferSelect;
  async function sectionData(section: Section, s: Share, query: unknown) {
    if (section === 'dashboard') return buildDashboard(db, s.childProfileId);
    if (section === 'readiness') {
      const q = z.object({ overlay: z.string().optional() }).parse(query ?? {});
      return buildReadiness(db, s.childProfileId, q.overlay ?? null);
    }
    if (section === 'specialisation') {
      const [profile, cycles] = await Promise.all([
        buildInterestProfile(db, s.childProfileId),
        db.select().from(explorationCycle).where(eq(explorationCycle.childProfileId, s.childProfileId)),
      ]);
      cycles.sort((a, b) => b.startedOn.getTime() - a.startedOn.getTime());
      return { interestProfile: profile, cycles };
    }
    return buildScholarPortfolio(db, s.childProfileId, s.familyId);
  }

  app.get('/shared/resolve', async (req, reply) => {
    const s = await resolveShare(req, reply);
    if (!s) return;
    const c = await db
      .select({ displayName: childProfile.displayName })
      .from(childProfile)
      .where(eq(childProfile.id, s.childProfileId));
    return {
      childDisplayName: c[0]?.displayName ?? null,
      role: s.role,
      label: s.label,
      scope: s.scope,
      expiresAt: s.expiresAt,
    };
  });

  for (const section of SHARE_SECTIONS) {
    app.get(`/shared/${section}`, { preHandler: requireSection(section) }, async (req) => {
      return sectionData(section, share(req), req.query);
    });
  }

  /* ──────────  Chế độ ACCOUNT: mời & tài khoản giáo viên/cố vấn (6c)  ────────── */
  const educatorGuard = { preHandler: guards.requireEducator };

  // Phụ huynh mời một educator bằng email + mã (mã trả về một lần).
  app.post('/children/:id/educators', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        email: z.string().email(),
        role: z.enum(['TEACHER', 'MENTOR']),
        scope: scopeSchema,
        label: z.string().max(120).optional(),
        expiresDays: z.number().int().min(1).max(365).optional(),
      })
      .parse(req.body);
    const auth = req.auth!;
    const child = await loadChild(id, req, reply);
    if (!child) return;
    const scope = {
      dashboard: !!body.scope.dashboard,
      readiness: !!body.scope.readiness,
      specialisation: !!body.scope.specialisation,
      scholar: !!body.scope.scholar,
    };
    if (!SHARE_SECTIONS.some((s) => scope[s])) return reply.code(422).send({ error: 'empty_scope' });

    const code = randomBytes(18).toString('base64url');
    const shareId = newId('shr');
    await db.insert(educatorShare).values({
      id: shareId,
      familyId: child.familyId,
      childProfileId: id,
      role: body.role,
      scope,
      label: body.label ?? null,
      mode: 'ACCOUNT',
      inviteEmail: body.email.toLowerCase(),
      inviteCodeHash: hashToken(code),
      status: 'PENDING',
      createdByUserId: auth.userId,
      expiresAt: body.expiresDays ? new Date(Date.now() + body.expiresDays * 86_400_000) : null,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'educator_share.invited',
      resourceType: 'educator_share',
      resourceId: shareId,
      familyId: auth.familyId,
      metadata: { childId: id, role: body.role, email: body.email.toLowerCase() },
    });
    return reply.code(201).send({ id: shareId, inviteCode: code });
  });

  // Educator nhận lời mời -> gắn tài khoản, chuyển PENDING -> ACTIVE.
  app.post('/educator/invites/accept', educatorGuard, async (req, reply) => {
    const body = z.object({ code: z.string().min(6).max(200) }).parse(req.body);
    const auth = req.auth!;
    const me = await db.select({ email: user.email }).from(user).where(eq(user.id, auth.userId));
    const myEmail = me[0]?.email.toLowerCase();
    const rows = await db
      .select()
      .from(educatorShare)
      .where(and(eq(educatorShare.inviteCodeHash, hashToken(body.code)), eq(educatorShare.mode, 'ACCOUNT')));
    const s = rows[0];
    if (!s || s.status !== 'PENDING' || (s.expiresAt && s.expiresAt.getTime() < Date.now())) {
      return reply.code(404).send({ error: 'invite_invalid_or_expired' });
    }
    if (s.inviteEmail && s.inviteEmail !== myEmail) {
      return reply.code(403).send({ error: 'invite_email_mismatch' });
    }
    await db
      .update(educatorShare)
      .set({ status: 'ACTIVE', educatorUserId: auth.userId })
      .where(eq(educatorShare.id, s.id));
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'educator_share.accepted',
      resourceType: 'educator_share',
      resourceId: s.id,
      familyId: s.familyId,
    });
    return { id: s.id, status: 'ACTIVE', childProfileId: s.childProfileId, scope: s.scope, role: s.role };
  });

  // Danh sách trẻ mà educator đang được chia sẻ.
  async function activeSharesFor(educatorUserId: string, childId?: string) {
    const conds = [
      eq(educatorShare.educatorUserId, educatorUserId),
      eq(educatorShare.mode, 'ACCOUNT'),
      eq(educatorShare.status, 'ACTIVE'),
    ];
    if (childId) conds.push(eq(educatorShare.childProfileId, childId));
    const rows = await db.select().from(educatorShare).where(and(...conds));
    return rows.filter((r) => !r.expiresAt || r.expiresAt.getTime() >= Date.now());
  }

  app.get('/educator/children', educatorGuard, async (req) => {
    const shares = await activeSharesFor(req.auth!.userId);
    const out = await Promise.all(
      shares.map(async (s) => {
        const c = await db
          .select({ displayName: childProfile.displayName })
          .from(childProfile)
          .where(eq(childProfile.id, s.childProfileId));
        return {
          shareId: s.id,
          childProfileId: s.childProfileId,
          childDisplayName: c[0]?.displayName ?? null,
          role: s.role,
          label: s.label,
          scope: s.scope,
        };
      }),
    );
    return { children: out };
  });

  for (const section of SHARE_SECTIONS) {
    app.get(`/educator/children/:childId/${section}`, educatorGuard, async (req, reply) => {
      const { childId } = z.object({ childId: z.string() }).parse(req.params);
      const shares = await activeSharesFor(req.auth!.userId, childId);
      const s = shares[0];
      if (!s) return reply.code(404).send({ error: 'not_shared' });
      if (!s.scope?.[section]) return reply.code(403).send({ error: 'section_not_shared', section });
      void db.update(educatorShare).set({ lastAccessedAt: new Date() }).where(eq(educatorShare.id, s.id));
      return sectionData(section, s, req.query);
    });
  }
}
