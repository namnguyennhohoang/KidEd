import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { AuthContext, Guards } from '../auth/context.js';
import {
  session,
  sessionEvent,
  attempt,
  attemptError,
  reflection,
  hintInteraction,
  ruleFiring,
  artifact,
  artifactVersion,
  childProfile,
  learningUnit,
  learningUnitSkill,
  consent,
} from '../db/schema.js';
import { newId } from '../auth/crypto.js';
import { writeAudit } from '../audit.js';
import { buildSnapshot } from '../learning/snapshot.js';
import { runCoachTurn } from '../learning/coach.js';
import { recordSessionSkillEvidence, recordSessionInterestSignals } from '../learning/skill-evidence.js';
import type { StoragePort } from '../storage/index.js';
import { checkUpload, requiredConsentFor, MAX_UPLOAD_BYTES } from '../storage/validate-upload.js';
import type { AiGateway, UnitHint } from '@tiny/ai-gateway';
import { isSessionEventType } from '@tiny/analytics';

interface Opts {
  storage: StoragePort;
  gateway: AiGateway;
}

interface UnitRow {
  id: string;
  title: string;
  stage: string;
  choices: Array<{ id: string; label: string }>;
  questFlow: Record<string, unknown>;
  hints: Array<Record<string, unknown>>;
}

function minAttempts(questFlow: Record<string, unknown>): number {
  const ar = (questFlow?.attempt_requirement ?? {}) as { minimum_attempts_before_solution?: number };
  return Math.max(1, ar.minimum_attempts_before_solution ?? 1);
}

function unitHints(hints: Array<Record<string, unknown>>): UnitHint[] {
  return hints.map((h) => {
    const u: UnitHint = { level: Number(h.level), type: h.type as UnitHint['type'] };
    if (typeof h.content === 'string') u.content = h.content;
    if (typeof h.content_ref === 'string') u.content_ref = h.content_ref;
    return u;
  });
}

function prompts(questFlow: Record<string, unknown>) {
  return {
    hook: str(questFlow.hook),
    plan_prompt: str(questFlow.plan_prompt),
    explain_prompt: str(questFlow.explain_prompt),
    reflection_prompt: str(questFlow.reflection_prompt),
  };
}
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Đọc một field text từ multipart (fastify-multipart). */
function readField(f: unknown): string | null {
  if (f && typeof f === 'object' && 'value' in f && typeof (f as { value: unknown }).value === 'string') {
    return (f as { value: string }).value;
  }
  return null;
}

export function registerSessionRoutes(app: FastifyInstance, db: Database, guards: Guards, opts: Opts): void {
  const child = { preHandler: guards.requireChild };
  const anyAuth = { preHandler: guards.requireAuth };

  /** Nạp session mà người gọi được phép thao tác. child -> sở hữu; parent -> cùng family. */
  async function loadSession(
    auth: AuthContext,
    id: string,
    reply: FastifyReply,
    opts2: { write: boolean },
  ) {
    const rows = await db
      .select({
        s: session,
        familyId: childProfile.familyId,
      })
      .from(session)
      .innerJoin(childProfile, eq(childProfile.id, session.childProfileId))
      .where(eq(session.id, id));
    const row = rows[0];
    if (!row) {
      reply.code(404).send({ error: 'not_found' });
      return null;
    }
    if (auth.kind === 'CHILD') {
      if (row.s.childProfileId !== auth.childProfileId) {
        reply.code(404).send({ error: 'not_found' });
        return null;
      }
    } else if (auth.kind === 'PARENT') {
      if (opts2.write) {
        reply.code(403).send({ error: 'forbidden', reason: 'child_session_required' });
        return null;
      }
      if (row.familyId !== auth.familyId) {
        reply.code(404).send({ error: 'not_found' });
        return null;
      }
    } else {
      reply.code(403).send({ error: 'forbidden' });
      return null;
    }
    return row.s;
  }

  async function emit(
    sessionId: string,
    type: string,
    payload: Record<string, unknown> | undefined,
    clientGeneratedId?: string,
  ) {
    await db
      .insert(sessionEvent)
      .values({
        id: newId('ev'),
        sessionId,
        type,
        payload: payload ?? null,
        occurredAt: new Date(),
        clientGeneratedId: clientGeneratedId ?? newId('scg'),
        source: 'SERVER',
      })
      .onConflictDoNothing();
  }

  async function loadUnit(id: string): Promise<UnitRow | null> {
    const rows = await db
      .select({
        id: learningUnit.id,
        title: learningUnit.title,
        stage: learningUnit.stage,
        choices: learningUnit.choices,
        questFlow: learningUnit.questFlow,
        hints: learningUnit.hints,
      })
      .from(learningUnit)
      .where(eq(learningUnit.id, id));
    return rows[0] ?? null;
  }

  async function attemptCount(sessionId: string): Promise<number> {
    const r = await db.execute(
      sql`select count(*)::int as n from attempt where session_id = ${sessionId}`,
    );
    return (r.rows[0] as { n: number }).n;
  }

  async function lastHintLevel(sessionId: string): Promise<number> {
    const rows = await db
      .select({ lvl: hintInteraction.helpLadderLevel })
      .from(hintInteraction)
      .where(eq(hintInteraction.sessionId, sessionId));
    return rows.reduce((m, x) => Math.max(m, x.lvl), 0);
  }

  // ── MVP bước 3–4: bắt đầu phiên + kế hoạch ──
  app.post('/sessions', child, async (req, reply) => {
    const body = z
      .object({
        learningUnitId: z.string(),
        clientGeneratedId: z.string().min(1).max(200),
        createdOffline: z.boolean().optional(),
        timed: z.boolean().optional(),
        timeBudgetSeconds: z.number().int().min(30).max(3600).optional(),
      })
      .parse(req.body);
    const auth = req.auth!;

    const existing = await db
      .select()
      .from(session)
      .where(eq(session.clientGeneratedId, body.clientGeneratedId));
    if (existing[0]) return reply.code(200).send({ id: existing[0].id, idempotent: true });

    const unit = await loadUnit(body.learningUnitId);
    if (!unit) return reply.code(404).send({ error: 'unit_not_found' });

    const id = newId('ses');
    const timed = body.timed ?? false;
    await db.insert(session).values({
      id,
      childProfileId: auth.childProfileId!,
      learningUnitId: unit.id,
      stage: unit.stage,
      clientGeneratedId: body.clientGeneratedId,
      createdOffline: body.createdOffline ?? false,
      timed,
      timeBudgetSeconds: timed ? (body.timeBudgetSeconds ?? 300) : null,
    });
    await emit(id, 'SESSION_STARTED', { unitId: unit.id });
    await emit(id, 'CHOICE_PRESENTED', { choiceCount: unit.choices.length });

    return reply.code(201).send({
      id,
      unit: { id: unit.id, title: unit.title, choices: unit.choices, questFlow: unit.questFlow },
      minimumAttempts: minAttempts(unit.questFlow),
      timed,
      timeBudgetSeconds: timed ? (body.timeBudgetSeconds ?? 300) : null,
    });
  });

  app.post('/sessions/:id/plan', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({ text: z.string().max(2000).optional(), choiceIds: z.array(z.string()).max(5).optional() })
      .parse(req.body);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;

    const now = new Date();
    const plan: { text?: string; choiceIds?: string[]; createdAt: string } = {
      createdAt: now.toISOString(),
    };
    if (body.text !== undefined) plan.text = body.text;
    if (body.choiceIds !== undefined) plan.choiceIds = body.choiceIds;
    await db
      .update(session)
      .set({ plan, firstActionAt: s.firstActionAt ?? now })
      .where(eq(session.id, id));
    if (body.choiceIds?.length) await emit(id, 'CHOICE_SELECTED', { choiceIds: body.choiceIds });
    if (!s.firstActionAt) await emit(id, 'FIRST_ACTION', { kind: 'plan' });
    return { ok: true };
  });

  // ── MVP bước 5: thử ──
  app.post('/sessions/:id/attempts', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        content: z.record(z.unknown()).optional(),
        clientGeneratedId: z.string().max(200).optional(),
      })
      .parse(req.body);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;

    const ord = (await attemptCount(id)) + 1;
    await db.insert(attempt).values({
      id: newId('att'),
      sessionId: id,
      ordinal: ord,
      content: body.content ?? null,
      clientGeneratedId: body.clientGeneratedId ?? null,
    });
    if (!s.firstActionAt) {
      await db.update(session).set({ firstActionAt: new Date() }).where(eq(session.id, id));
    }
    await emit(id, 'ATTEMPT_SUBMITTED', { ordinal: ord });
    return { ok: true, ordinal: ord };
  });

  // ── MVP bước 5 (hint): rule engine + DeterministicCoach ──
  app.post('/sessions/:id/hint', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        signals: z
          .object({
            childRequestedHelp: z.boolean().optional(),
            secondsSincePrompt: z.number().min(0).max(3600).optional(),
            configuredWaitSeconds: z.number().min(0).max(120).optional(),
            repeatedErrors: z.boolean().optional(),
            languageLoadHigh: z.boolean().optional(),
            representationIsAbstract: z.boolean().optional(),
            presentationAnxietyObserved: z.boolean().optional(),
            overloadObserved: z.boolean().optional(),
            distressObserved: z.boolean().optional(),
            outOfScopeRequest: z.boolean().optional(),
          })
          .optional(),
      })
      .parse(req.body ?? {});
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;

    const unit = await loadUnit(s.learningUnitId);
    if (!unit) return reply.code(404).send({ error: 'unit_not_found' });

    // EDU-1: cooldown — bấm gợi ý dồn dập không leo thang; trả lại gợi ý gần nhất.
    const HINT_COOLDOWN_MS = 8_000;
    const recent = await db
      .select()
      .from(hintInteraction)
      .where(eq(hintInteraction.sessionId, id))
      .orderBy(desc(hintInteraction.requestedAt))
      .limit(1);
    if (recent[0] && Date.now() - recent[0].requestedAt.getTime() < HINT_COOLDOWN_MS) {
      return {
        coach: {
          intent: recent[0].intent,
          child_message: recent[0].childMessage,
          hint_level: recent[0].helpLadderLevel,
          expected_action: 'TRY_AGAIN',
          wait_seconds: Math.ceil((HINT_COOLDOWN_MS - (Date.now() - recent[0].requestedAt.getTime())) / 1000),
          allowed_next_actions: ['WAIT', 'TRY_AGAIN'],
          safety_flag: null,
          parent_note: null,
        },
        maxHelpLadderLevel: recent[0].maxAllowedLevel,
        rulesFired: 0,
        cooldown: true,
      };
    }

    const cp = (
      await db
        .select({ by: childProfile.birthYear, bm: childProfile.birthMonth, cap: childProfile.screenSessionMinutes })
        .from(childProfile)
        .where(eq(childProfile.id, s.childProfileId))
    )[0]!;

    const snapshot = buildSnapshot({
      childBirthYear: cp.by,
      childBirthMonth: cp.bm,
      stage: s.stage,
      taskType: 'generic',
      attemptsMade: await attemptCount(id),
      minimumAttemptsBeforeSolution: minAttempts(unit.questFlow),
      currentHelpLadderLevel: await lastHintLevel(id),
      sessionStartedAt: s.startedAt,
      configuredSessionMinutesCap: cp.cap,
      signals: body.signals ?? {},
    });

    await emit(id, 'HINT_REQUESTED', undefined);
    const result = await runCoachTurn(db, opts.gateway, {
      sessionId: id,
      childProfileId: s.childProfileId,
      snapshot,
      unitHints: unitHints(unit.hints),
      prompts: prompts(unit.questFlow),
      learningUnitId: s.learningUnitId,
    });
    await emit(id, 'HINT_SHOWN', { level: result.response.hint_level, intent: result.response.intent });

    return {
      coach: result.response,
      maxHelpLadderLevel: result.maxHelpLadderLevel,
      rulesFired: result.firingCount,
      provider: result.provider,
      fellBack: result.fellBack,
    };
  });

  // ── MVP bước 7: artifact (ảnh/giọng/văn bản) ──
  app.post('/sessions/:id/artifacts', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;

    const mp = await req.file({ limits: { fileSize: MAX_UPLOAD_BYTES + 1024 } }).catch(() => null);
    if (!mp) return reply.code(400).send({ error: 'no_file' });
    const buf = await mp.toBuffer();

    if (mp.file.truncated) return reply.code(413).send({ error: 'file_too_large' });

    const check = checkUpload(mp.mimetype, buf);
    if (!check.ok) return reply.code(400).send({ error: 'invalid_upload', detail: check.error });

    // Consent theo loại (ảnh/giọng).
    const needed = requiredConsentFor(check.kind!);
    if (needed) {
      const c = await db
        .select({ id: consent.id })
        .from(consent)
        .where(
          and(
            eq(consent.childProfileId, s.childProfileId),
            eq(consent.type, needed),
            sql`${consent.revokedAt} is null`,
          ),
        );
      if (c.length === 0) return reply.code(403).send({ error: 'consent_required', consent: needed });
    }

    // Dedupe khi upload lại (retry / sync offline).
    const clientArtifactId = readField(mp.fields?.clientArtifactId)?.slice(0, 200) ?? null;
    if (clientArtifactId) {
      const dup = await db
        .select({ id: artifact.id, version: artifact.currentVersion, type: artifact.type })
        .from(artifact)
        .where(and(eq(artifact.sessionId, id), eq(artifact.clientArtifactId, clientArtifactId)));
      if (dup[0]) return reply.code(200).send({ id: dup[0].id, type: dup[0].type, version: dup[0].version, idempotent: true });
    }

    const familyId = (
      await db.select({ f: childProfile.familyId }).from(childProfile).where(eq(childProfile.id, s.childProfileId))
    )[0]!.f;

    const artId = newId('art');
    const key = `${familyId}/${s.childProfileId}/${artId}/v1.${check.ext}`;
    await opts.storage.put(key, buf, check.mime!);

    const transcriptText = (readField(mp.fields?.transcript) ?? '').slice(0, 4000) || null;

    await db.insert(artifact).values({
      id: artId,
      sessionId: id,
      childProfileId: s.childProfileId,
      type: check.kind!,
      clientArtifactId,
      storageKey: key,
      mimeType: check.mime!,
      byteSize: buf.length,
      transcriptText,
    });
    await db.insert(artifactVersion).values({
      id: newId('av'),
      artifactId: artId,
      version: 1,
      storageKey: key,
      note: 'bản gốc do trẻ tạo',
    });
    await emit(id, 'ARTIFACT_CREATED', { artifactId: artId, type: check.kind });
    if (transcriptText) await emit(id, 'EXPLANATION_RECORDED', { artifactId: artId });

    return reply.code(201).send({ id: artId, type: check.kind, version: 1 });
  });

  // ── MVP bước 8: reflection ──
  app.post('/sessions/:id/reflection', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        prompt: z.string().min(1).max(500),
        responseType: z.enum(['VOICE', 'TEXT', 'IMAGE_CHOICE']),
        responseText: z.string().max(2000).optional(),
        responseRef: z.string().max(500).optional(),
      })
      .parse(req.body);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;

    await db.insert(reflection).values({
      id: newId('ref'),
      sessionId: id,
      prompt: body.prompt,
      responseType: body.responseType,
      responseText: body.responseText ?? null,
      responseRef: body.responseRef ?? null,
    });
    await emit(id, 'REFLECTION_COMPLETED', { responseType: body.responseType });
    return { ok: true };
  });

  app.post('/sessions/:id/complete', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;
    const now = new Date();
    const timeSpentSeconds = Math.max(0, Math.round((now.getTime() - s.startedAt.getTime()) / 1000));
    await db
      .update(session)
      .set({ status: 'COMPLETED', endedAt: now, timeSpentSeconds })
      .where(eq(session.id, id));
    await emit(id, 'SESSION_COMPLETED', { timeSpentSeconds, timed: s.timed });
    await recordSessionSkillEvidence(db, {
      sessionId: id,
      childProfileId: s.childProfileId,
      learningUnitId: s.learningUnitId,
    });
    await recordSessionInterestSignals(db, {
      sessionId: id,
      childProfileId: s.childProfileId,
      learningUnitId: s.learningUnitId,
    });
    // Luyện tốc độ: vượt quỹ thời gian -> ghi nhận nguyên nhân TIME_PRESSURE (advisory, feed readiness).
    if (s.timed && s.timeBudgetSeconds && timeSpentSeconds > s.timeBudgetSeconds) {
      const prim = await db
        .select({ skillId: learningUnitSkill.skillId })
        .from(learningUnitSkill)
        .where(and(eq(learningUnitSkill.unitId, s.learningUnitId), eq(learningUnitSkill.role, 'PRIMARY')));
      await db.insert(attemptError).values({
        id: newId('aer'),
        attemptId: null,
        sessionId: id,
        childProfileId: s.childProfileId,
        skillId: prim[0]?.skillId ?? null,
        cause: 'TIME_PRESSURE',
        note: `vượt quỹ ${s.timeBudgetSeconds}s (thực tế ${timeSpentSeconds}s)`,
        classifiedBy: 'SYSTEM',
      });
    }
    await writeAudit(db, {
      actorUserId: req.auth!.userId,
      actorRole: req.auth!.role,
      action: 'session.completed',
      resourceType: 'session',
      resourceId: id,
      familyId: req.auth!.familyId,
    });
    return { ok: true };
  });

  app.post('/sessions/:id/pause', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;
    if (s.status === 'COMPLETED' || s.status === 'ABANDONED') {
      return { ok: true, unchanged: true }; // không đưa phiên đã kết thúc về PAUSED
    }
    await db.update(session).set({ status: 'PAUSED' }).where(eq(session.id, id));
    await emit(id, 'SESSION_PAUSED', undefined);
    return { ok: true };
  });

  // ── Đồng bộ offline (client PWA đầy đủ ở Slice 3c) ──
  app.post('/sessions/:id/events', child, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z
      .object({
        events: z
          .array(
            z.object({
              type: z.string(),
              clientGeneratedId: z.string().min(1).max(200),
              occurredAt: z.string(),
              payload: z.record(z.unknown()).optional(),
            }),
          )
          .max(200),
      })
      .parse(req.body);
    const s = await loadSession(req.auth!, id, reply, { write: true });
    if (!s) return;

    const badTypes = [...new Set(body.events.map((e) => e.type).filter((t) => !isSessionEventType(t)))];
    if (badTypes.length) return reply.code(400).send({ error: 'unknown_event_type', types: badTypes });

    let inserted = 0;
    for (const e of body.events) {
      const res = await db
        .insert(sessionEvent)
        .values({
          id: newId('ev'),
          sessionId: id,
          type: e.type,
          payload: e.payload ?? null,
          occurredAt: new Date(e.occurredAt),
          clientGeneratedId: e.clientGeneratedId,
          source: 'CHILD_APP',
        })
        .onConflictDoNothing()
        .returning({ id: sessionEvent.id });
      if (res.length) inserted += 1;
      if (e.type === 'FIRST_ACTION' && !s.firstActionAt) {
        await db.update(session).set({ firstActionAt: new Date(e.occurredAt) }).where(eq(session.id, id));
      }
    }
    return { received: body.events.length, inserted, deduped: body.events.length - inserted };
  });

  /**
   * ── Đồng bộ một phiên TẠO OFFLINE (ADR 0005) ──
   * Idempotent theo `session.clientGeneratedId` + `(session,cgid)` cho attempt/event.
   * Không làm mất sản phẩm: artifact upload riêng qua `/artifacts` (dedupe theo clientArtifactId).
   */
  app.post('/sessions/sync', child, async (req, reply) => {
    const body = z
      .object({
        session: z.object({
          clientGeneratedId: z.string().min(1).max(200),
          learningUnitId: z.string(),
          startedAt: z.string(),
          timed: z.boolean().optional(),
          timeBudgetSeconds: z.number().int().min(30).max(3600).optional(),
          plan: z
            .object({ text: z.string().max(2000).optional(), choiceIds: z.array(z.string()).max(5).optional() })
            .optional(),
        }),
        attempts: z
          .array(
            z.object({
              clientGeneratedId: z.string().min(1).max(200),
              ordinal: z.number().int().min(1),
              content: z.record(z.unknown()).optional(),
              submittedAt: z.string(),
            }),
          )
          .max(100)
          .default([]),
        hints: z
          .array(
            z.object({
              helpLadderLevel: z.number().int().min(0).max(6),
              maxAllowedLevel: z.number().int().min(0).max(6),
              intent: z.string(),
              childMessage: z.string().max(600),
              requestedAt: z.string(),
              firings: z
                .array(
                  z.object({
                    ruleId: z.string(),
                    ruleVersion: z.string(),
                    parentExplanation: z.string(),
                    decision: z.string(),
                    inputsUsed: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
                  }),
                )
                .max(20)
                .optional(),
            }),
          )
          .max(50)
          .default([]),
        events: z
          .array(
            z.object({
              type: z.string(),
              clientGeneratedId: z.string().min(1).max(200),
              occurredAt: z.string(),
              payload: z.record(z.unknown()).optional(),
            }),
          )
          .max(200)
          .default([]),
        reflection: z
          .object({
            prompt: z.string().min(1).max(500),
            responseType: z.enum(['VOICE', 'TEXT', 'IMAGE_CHOICE']),
            responseText: z.string().max(2000).optional(),
            responseRef: z.string().max(500).optional(),
          })
          .optional(),
        completed: z.boolean().optional(),
      })
      .parse(req.body);
    const auth = req.auth!;

    const unit = await loadUnit(body.session.learningUnitId);
    if (!unit) return reply.code(404).send({ error: 'unit_not_found' });

    // 1) Upsert session theo clientGeneratedId.
    const existing = await db
      .select()
      .from(session)
      .where(eq(session.clientGeneratedId, body.session.clientGeneratedId));
    let sid: string;
    let created = false;
    if (existing[0]) {
      if (existing[0].childProfileId !== auth.childProfileId) {
        return reply.code(404).send({ error: 'not_found' });
      }
      sid = existing[0].id;
    } else {
      sid = newId('ses');
      created = true;
      const startedAt = new Date(body.session.startedAt);
      const timed = body.session.timed ?? false;
      await db.insert(session).values({
        id: sid,
        childProfileId: auth.childProfileId!,
        learningUnitId: unit.id,
        stage: unit.stage,
        clientGeneratedId: body.session.clientGeneratedId,
        createdOffline: true,
        startedAt,
        firstActionAt: startedAt,
        syncedAt: new Date(),
        timed,
        timeBudgetSeconds: timed ? (body.session.timeBudgetSeconds ?? 300) : null,
      });
      await emit(sid, 'SESSION_STARTED', { unitId: unit.id, offline: true }, `sync-start-${body.session.clientGeneratedId}`);
    }
    if (body.session.plan) {
      const plan: { text?: string; choiceIds?: string[]; createdAt: string } = { createdAt: new Date().toISOString() };
      if (body.session.plan.text !== undefined) plan.text = body.session.plan.text;
      if (body.session.plan.choiceIds !== undefined) plan.choiceIds = body.session.plan.choiceIds;
      await db.update(session).set({ plan }).where(eq(session.id, sid));
    }

    // 2) Attempts (idempotent theo (session, cgid)).
    let attemptsInserted = 0;
    for (const a of body.attempts) {
      const r = await db
        .insert(attempt)
        .values({
          id: newId('att'),
          sessionId: sid,
          ordinal: a.ordinal,
          content: a.content ?? null,
          clientGeneratedId: a.clientGeneratedId,
          submittedAt: new Date(a.submittedAt),
        })
        .onConflictDoNothing()
        .returning({ id: attempt.id });
      if (r.length) attemptsInserted += 1;
    }

    // 3) Events (idempotent). Bỏ qua loại lạ (không làm hỏng cả lần sync offline).
    let eventsInserted = 0;
    let eventsDropped = 0;
    for (const e of body.events) {
      if (!isSessionEventType(e.type)) {
        eventsDropped += 1;
        continue;
      }
      const r = await db
        .insert(sessionEvent)
        .values({
          id: newId('ev'),
          sessionId: sid,
          type: e.type,
          payload: e.payload ?? null,
          occurredAt: new Date(e.occurredAt),
          clientGeneratedId: e.clientGeneratedId,
          source: 'CHILD_APP',
        })
        .onConflictDoNothing()
        .returning({ id: sessionEvent.id });
      if (r.length) eventsInserted += 1;
    }

    // 4) Hint interactions + rule_firing (tính offline bằng cùng rule engine).
    const alreadyHinted = (
      await db.select({ id: hintInteraction.id }).from(hintInteraction).where(eq(hintInteraction.sessionId, sid))
    ).length;
    if (alreadyHinted === 0) {
      for (const hnt of body.hints) {
        await db.insert(hintInteraction).values({
          id: newId('hi'),
          sessionId: sid,
          helpLadderLevel: hnt.helpLadderLevel,
          maxAllowedLevel: hnt.maxAllowedLevel,
          intent: hnt.intent,
          childMessage: hnt.childMessage,
          coachProvider: 'deterministic-offline',
          requestedAt: new Date(hnt.requestedAt),
          shownAt: new Date(hnt.requestedAt),
        });
        for (const f of hnt.firings ?? []) {
          await db.insert(ruleFiring).values({
            id: newId('rf'),
            ruleId: f.ruleId,
            ruleVersion: f.ruleVersion,
            childProfileId: auth.childProfileId,
            sessionId: sid,
            parentExplanation: f.parentExplanation,
            decision: f.decision,
            inputsUsed: f.inputsUsed ?? null,
          });
        }
      }
    }

    // 5) Reflection (một lần).
    const hasReflection = (
      await db.select({ id: reflection.id }).from(reflection).where(eq(reflection.sessionId, sid))
    ).length;
    if (body.reflection && hasReflection === 0) {
      await db.insert(reflection).values({
        id: newId('ref'),
        sessionId: sid,
        prompt: body.reflection.prompt,
        responseType: body.reflection.responseType,
        responseText: body.reflection.responseText ?? null,
        responseRef: body.reflection.responseRef ?? null,
      });
      await emit(sid, 'REFLECTION_COMPLETED', { responseType: body.reflection.responseType }, `sync-refl-${sid}`);
    }

    // 6) Hoàn thành (một lần).
    const cur = (await db.select().from(session).where(eq(session.id, sid)))[0]!;
    if (body.completed && cur.status !== 'COMPLETED') {
      const doneAt = new Date();
      const timeSpentSeconds = Math.max(0, Math.round((doneAt.getTime() - cur.startedAt.getTime()) / 1000));
      await db
        .update(session)
        .set({ status: 'COMPLETED', endedAt: doneAt, timeSpentSeconds })
        .where(eq(session.id, sid));
      await emit(sid, 'SESSION_COMPLETED', { offline: true, timeSpentSeconds, timed: cur.timed }, `sync-done-${sid}`);
      await recordSessionSkillEvidence(db, {
        sessionId: sid,
        childProfileId: auth.childProfileId!,
        learningUnitId: unit.id,
      });
      await recordSessionInterestSignals(db, {
        sessionId: sid,
        childProfileId: auth.childProfileId!,
        learningUnitId: unit.id,
      });
      // Luyện tốc độ: vượt quỹ thời gian -> ghi nhận nguyên nhân TIME_PRESSURE (advisory).
      if (cur.timed && cur.timeBudgetSeconds && timeSpentSeconds > cur.timeBudgetSeconds) {
        const prim = await db
          .select({ skillId: learningUnitSkill.skillId })
          .from(learningUnitSkill)
          .where(and(eq(learningUnitSkill.unitId, unit.id), eq(learningUnitSkill.role, 'PRIMARY')));
        await db.insert(attemptError).values({
          id: newId('aer'),
          attemptId: null,
          sessionId: sid,
          childProfileId: auth.childProfileId!,
          skillId: prim[0]?.skillId ?? null,
          cause: 'TIME_PRESSURE',
          note: `vượt quỹ ${cur.timeBudgetSeconds}s (thực tế ${timeSpentSeconds}s)`,
          classifiedBy: 'SYSTEM',
        });
      }
      await writeAudit(db, {
        actorUserId: auth.userId,
        actorRole: auth.role,
        action: 'session.synced',
        resourceType: 'session',
        resourceId: sid,
        familyId: auth.familyId,
        metadata: { created, attemptsInserted, eventsInserted },
      });
    }

    return reply.code(created ? 201 : 200).send({
      sessionId: sid,
      created,
      attemptsInserted,
      eventsInserted,
      eventsDropped,
      status: (await db.select({ status: session.status }).from(session).where(eq(session.id, sid)))[0]!.status,
    });
  });

  // ── Đọc toàn bộ phiên (child sở hữu, hoặc parent cùng family) ──
  app.get('/sessions/:id', anyAuth, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const s = await loadSession(req.auth!, id, reply, { write: false });
    if (!s) return;

    const [events, attempts, hints, refl, arts] = await Promise.all([
      db.select().from(sessionEvent).where(eq(sessionEvent.sessionId, id)).orderBy(asc(sessionEvent.occurredAt)),
      db.select().from(attempt).where(eq(attempt.sessionId, id)).orderBy(asc(attempt.ordinal)),
      db.select().from(hintInteraction).where(eq(hintInteraction.sessionId, id)).orderBy(asc(hintInteraction.requestedAt)),
      db.select().from(reflection).where(eq(reflection.sessionId, id)),
      db.select().from(artifact).where(eq(artifact.sessionId, id)),
    ]);
    return { session: s, events, attempts, hints, reflection: refl[0] ?? null, artifacts: arts };
  });
}
