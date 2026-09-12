import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { Guards } from '../auth/context.js';
import { assertFamilyAccess, PIN_TTL_MS } from '../auth/context.js';
import {
  childProfile,
  childAssent,
  parentObservation,
  skillEvidence,
  session,
  sessionEvent,
  dataRequest,
  auditLog,
  family,
} from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import { buildDashboard } from '../learning/dashboard.js';
import { collectExport } from '../learning/export.js';
import type { StoragePort } from '../storage/index.js';

interface Opts {
  storage: StoragePort;
}

export function registerGovernanceRoutes(app: FastifyInstance, db: Database, guards: Guards, opts: Opts): void {
  const parent = { preHandler: guards.requireParent };
  const pinned = { preHandler: guards.requirePinVerified };

  async function loadChildInFamily(auth: { familyId: string | null; kind: string }, id: string, reply: FastifyReply) {
    const rows = await db.select().from(childProfile).where(eq(childProfile.id, id));
    const child = rows[0];
    if (!child) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (!assertFamilyAccess(reply, auth as never, child.familyId)) return null;
    return child;
  }

  // ── MVP bước 9: phụ huynh thêm quan sát ──
  app.post('/children/:id/observations', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        text: z.string().min(1).max(2000),
        sessionId: z.string().optional(),
        tags: z.array(z.string().max(40)).max(10).optional(),
      })
      .parse(req.body);
    const auth = req.auth!;
    const child = await loadChildInFamily(auth, id, reply);
    if (!child) return;

    if (body.sessionId) {
      const s = await db.select({ cp: session.childProfileId }).from(session).where(eq(session.id, body.sessionId));
      if (!s[0] || s[0].cp !== id) return reply.code(400).send({ error: 'session_mismatch' });
    }

    const obsId = newId('obs');
    await db.insert(parentObservation).values({
      id: obsId,
      childProfileId: id,
      sessionId: body.sessionId ?? null,
      authorUserId: auth.userId,
      text: body.text,
      tags: body.tags ?? null,
    });
    if (body.sessionId) {
      await db.insert(sessionEvent).values({
        id: newId('ev'),
        sessionId: body.sessionId,
        type: 'PARENT_OBSERVATION_ADDED',
        payload: { observationId: obsId },
        occurredAt: new Date(),
        clientGeneratedId: newId('scg'),
        source: 'PARENT_APP',
      });
    }
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'parent_observation.added',
      resourceType: 'child_profile',
      resourceId: id,
      familyId: auth.familyId,
    });
    return reply.code(201).send({ id: obsId });
  });

  // ── Sự đồng ý của trẻ (child assent) — spec §6.1/§12 ──
  const ASSENT_TYPES = [
    'DATA_PROCESSING',
    'VOICE_RECORDING',
    'IMAGE_UPLOAD',
    'SHARING_FAMILY',
    'SHARING_TEACHER',
  ] as const;

  app.post('/children/:id/assent', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        type: z.enum(ASSENT_TYPES),
        given: z.boolean(),
        method: z.enum(['VERBAL_TO_PARENT', 'TAP_YES', 'OBSERVED']),
        note: z.string().max(500).optional(),
      })
      .parse(req.body);
    const auth = req.auth!;
    const child = await loadChildInFamily(auth, id, reply);
    if (!child) return;

    const assentId = newId('asn');
    await db.insert(childAssent).values({
      id: assentId,
      childProfileId: id,
      type: body.type,
      given: body.given,
      method: body.method,
      recordedByUserId: auth.userId,
      note: body.note ?? null,
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: 'child_assent.recorded',
      resourceType: 'child_profile',
      resourceId: id,
      familyId: auth.familyId,
      metadata: { type: body.type, given: body.given, method: body.method },
    });
    return reply.code(201).send({ id: assentId });
  });

  app.get('/children/:id/assent', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const child = await loadChildInFamily(req.auth!, id, reply);
    if (!child) return;
    const rows = await db
      .select()
      .from(childAssent)
      .where(eq(childAssent.childProfileId, id))
      .orderBy(desc(childAssent.createdAt));
    // Trạng thái hiện tại theo từng loại (bản ghi mới nhất chưa rút lại).
    const current: Record<string, { given: boolean; method: string; at: string }> = {};
    for (const r of rows) {
      if (!current[r.type] && !r.withdrawnAt) {
        current[r.type] = { given: r.given, method: r.method, at: r.createdAt.toISOString() };
      }
    }
    return { childId: id, current, history: rows };
  });

  // ── MVP bước 10: dashboard (PIN-gated). KHÔNG xếp hạng / dự báo / IQ. ──
  app.get('/children/:id/dashboard', pinned, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const child = await loadChildInFamily(req.auth!, id, reply);
    if (!child) return;
    const dashboard = await buildDashboard(db, id);
    return { childId: id, displayName: child.displayName, dashboard };
  });

  app.get('/children/:id/skill-evidence', parent, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const child = await loadChildInFamily(req.auth!, id, reply);
    if (!child) return;
    const rows = await db
      .select()
      .from(skillEvidence)
      .where(eq(skillEvidence.childProfileId, id))
      .orderBy(desc(skillEvidence.recencyAt));
    const bySkill: Record<string, typeof rows> = {};
    for (const r of rows) (bySkill[r.skillId] ??= []).push(r);
    return { childId: id, totalEvidence: rows.length, distinctSkills: Object.keys(bySkill).length, bySkill };
  });

  // ── MVP bước 12: export / delete dữ liệu ──
  function assertOwnFamily(reply: FastifyReply, auth: { familyId: string | null }, familyId: string) {
    if (auth.familyId !== familyId) {
      reply.code(404).send({ error: 'not_found' });
      return false;
    }
    return true;
  }

  app.post('/families/:familyId/data-requests', parent, async (req, reply) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params);
    const body = z
      .object({
        kind: z.enum(['EXPORT', 'DELETE']),
        childProfileId: z.string().optional(),
        confirm: z.boolean().optional(),
        deleteEntireFamily: z.boolean().optional(),
      })
      .parse(req.body);
    const auth = req.auth!;
    if (!assertOwnFamily(reply, auth, familyId)) return;

    // Xóa dữ liệu là hành động không thể hoàn tác -> bắt buộc xác thực PIN gần đây.
    if (body.kind === 'DELETE') {
      const pinOk = auth.pinVerifiedAt && Date.now() - auth.pinVerifiedAt.getTime() < PIN_TTL_MS;
      if (!pinOk) return reply.code(403).send({ error: 'forbidden', reason: 'pin_verification_required' });
    }

    if (body.childProfileId) {
      const c = await db.select({ f: childProfile.familyId }).from(childProfile).where(eq(childProfile.id, body.childProfileId));
      if (!c[0] || c[0].f !== familyId) return reply.code(404).send({ error: 'child_not_found' });
    }

    const reqId = newId('dr');
    await db.insert(dataRequest).values({
      id: reqId,
      familyId,
      requestedByUserId: auth.userId,
      kind: body.kind,
      scope: body.childProfileId ? { childProfileId: body.childProfileId } : {},
      status: 'PROCESSING',
    });
    await writeAudit(db, {
      actorUserId: auth.userId,
      actorRole: auth.role,
      action: `data_request.${body.kind.toLowerCase()}`,
      resourceType: 'family',
      resourceId: familyId,
      familyId,
      metadata: { childProfileId: body.childProfileId ?? null, deleteEntireFamily: !!body.deleteEntireFamily },
    });

    try {
      if (body.kind === 'EXPORT') {
        const data = await collectExport(db, familyId, body.childProfileId);
        const key = `exports/${familyId}/${reqId}.json`;
        await opts.storage.put(key, Buffer.from(JSON.stringify(data, null, 2)), 'application/json');
        await db
          .update(dataRequest)
          .set({ status: 'DONE', resultKey: key, completedAt: new Date() })
          .where(eq(dataRequest.id, reqId));
        return reply.code(201).send({ id: reqId, status: 'DONE', downloadPath: `/families/${familyId}/data-requests/${reqId}/download` });
      }

      // DELETE
      if (!body.confirm) {
        await db.update(dataRequest).set({ status: 'FAILED', error: 'confirm_required' }).where(eq(dataRequest.id, reqId));
        return reply.code(400).send({ error: 'confirm_required' });
      }
      if (body.deleteEntireFamily) {
        await db.delete(family).where(eq(family.id, familyId)); // cascade toàn bộ
      } else if (body.childProfileId) {
        await db.delete(childProfile).where(eq(childProfile.id, body.childProfileId)); // cascade dữ liệu trẻ
      } else {
        await db.update(dataRequest).set({ status: 'FAILED', error: 'scope_required' }).where(eq(dataRequest.id, reqId));
        return reply.code(400).send({ error: 'scope_required (childProfileId hoặc deleteEntireFamily)' });
      }
      // Bản ghi data_request thuộc family — nếu xóa cả family thì nó cũng đã bị cascade.
      if (!body.deleteEntireFamily) {
        await db.update(dataRequest).set({ status: 'DONE', completedAt: new Date() }).where(eq(dataRequest.id, reqId));
      }
      return reply.code(200).send({ id: reqId, status: 'DONE', deleted: body.deleteEntireFamily ? 'family' : 'child' });
    } catch (e) {
      await db
        .update(dataRequest)
        .set({ status: 'FAILED', error: (e as Error).message })
        .where(eq(dataRequest.id, reqId))
        .catch(() => undefined);
      return reply.code(500).send({ error: 'processing_failed' });
    }
  });

  app.get('/families/:familyId/data-requests/:reqId', parent, async (req, reply) => {
    const { familyId, reqId } = z.object({ familyId: z.string(), reqId: z.string() }).parse(req.params);
    if (!assertOwnFamily(reply, req.auth!, familyId)) return;
    const rows = await db
      .select()
      .from(dataRequest)
      .where(and(eq(dataRequest.id, reqId), eq(dataRequest.familyId, familyId)));
    if (!rows[0]) return reply.code(404).send({ error: 'not_found' });
    return rows[0];
  });

  app.get('/families/:familyId/data-requests/:reqId/download', parent, async (req, reply) => {
    const { familyId, reqId } = z.object({ familyId: z.string(), reqId: z.string() }).parse(req.params);
    if (!assertOwnFamily(reply, req.auth!, familyId)) return;
    const rows = await db
      .select()
      .from(dataRequest)
      .where(and(eq(dataRequest.id, reqId), eq(dataRequest.familyId, familyId)));
    const dr = rows[0];
    if (!dr || dr.kind !== 'EXPORT' || dr.status !== 'DONE' || !dr.resultKey) {
      return reply.code(404).send({ error: 'not_available' });
    }
    const buf = await opts.storage.get(dr.resultKey);
    return reply.header('content-type', 'application/json').send(buf);
  });

  app.get('/families/:familyId/audit-log', parent, async (req, reply) => {
    const { familyId } = z.object({ familyId: z.string() }).parse(req.params);
    const q = z.object({ limit: z.coerce.number().min(1).max(200).default(50) }).parse(req.query);
    if (!assertOwnFamily(reply, req.auth!, familyId)) return;
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.familyId, familyId))
      .orderBy(desc(auditLog.occurredAt))
      .limit(q.limit);
    return { entries: rows };
  });
}
