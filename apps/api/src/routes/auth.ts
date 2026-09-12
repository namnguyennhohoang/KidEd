import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import type { Guards } from '../auth/context.js';
import { SESSION_COOKIE, CHILD_COOKIE } from '../auth/context.js';
import {
  registerFamily,
  registerEducator,
  login,
  revokeSession,
  verifyPin,
  PARENT_SESSION_TTL_MS,
} from '../auth/service.js';
import type { LoginThrottle } from '../auth/rate-limit.js';
import { issueCsrf } from '../auth/csrf.js';
import { writeAudit } from '../audit.js';
import { eq } from 'drizzle-orm';
import { user } from '../db/schema.js';

interface Opts {
  isProd: boolean;
  loginThrottle: LoginThrottle;
}

const registerBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  familyName: z.string().min(1).max(120),
  displayName: z.string().min(1).max(120),
  pin: z.string().regex(/^\d{4,8}$/),
});

export function registerAuthRoutes(app: FastifyInstance, db: Database, guards: Guards, opts: Opts): void {
  const cookieOpts = (maxAgeMs: number) => ({
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: opts.isProd,
    path: '/',
    maxAge: Math.floor(maxAgeMs / 1000),
  });

  app.post('/auth/register', async (req, reply) => {
    const body = registerBody.parse(req.body);
    try {
      const s = await registerFamily(db, body);
      reply.setCookie(SESSION_COOKIE, s.token, cookieOpts(PARENT_SESSION_TTL_MS));
      issueCsrf(reply, opts.isProd);
      return reply.code(201).send({ ok: true, token: s.token, expiresAt: s.expiresAt });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 500;
      return reply.code(code).send({ error: (e as Error).message });
    }
  });

  app.post('/auth/register-educator', async (req, reply) => {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(8).max(200),
        displayName: z.string().min(1).max(120),
        role: z.enum(['TEACHER', 'MENTOR']),
      })
      .parse(req.body);
    try {
      const s = await registerEducator(db, body);
      reply.setCookie(SESSION_COOKIE, s.token, cookieOpts(PARENT_SESSION_TTL_MS));
      issueCsrf(reply, opts.isProd);
      return reply.code(201).send({ ok: true, token: s.token, expiresAt: s.expiresAt, role: body.role });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 500;
      return reply.code(code).send({ error: (e as Error).message });
    }
  });

  app.post('/auth/login', async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);

    const gate = opts.loginThrottle.check(body.email);
    if (!gate.allowed) {
      return reply
        .code(429)
        .header('retry-after', String(gate.retryAfterSec))
        .send({ error: 'too_many_attempts', retryAfterSec: gate.retryAfterSec });
    }

    try {
      const s = await login(db, body.email, body.password);
      opts.loginThrottle.recordSuccess(body.email);
      reply.setCookie(SESSION_COOKIE, s.token, cookieOpts(PARENT_SESSION_TTL_MS));
      issueCsrf(reply, opts.isProd);
      return reply.send({ ok: true, token: s.token, expiresAt: s.expiresAt });
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode ?? 500;
      if (code === 401) {
        const { locked } = opts.loginThrottle.recordFailure(body.email);
        // Ghi audit để phụ huynh thấy hoạt động bất thường (không lộ có/không tồn tại email).
        const u = await db
          .select({ id: user.id, familyId: user.familyId, role: user.role })
          .from(user)
          .where(eq(user.email, body.email));
        if (u[0]) {
          await writeAudit(db, {
            actorUserId: u[0].id,
            actorRole: u[0].role,
            action: locked ? 'auth.login_locked' : 'auth.login_failed',
            resourceType: 'user',
            resourceId: u[0].id,
            familyId: u[0].familyId,
          });
        }
        if (locked) {
          return reply.code(429).send({ error: 'too_many_attempts', retryAfterSec: gate.retryAfterSec || 300 });
        }
      }
      return reply.code(code).send({ error: (e as Error).message });
    }
  });

  app.post('/auth/logout', { preHandler: guards.requireAuth }, async (req, reply) => {
    await revokeSession(db, req.auth!.sessionId);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    reply.clearCookie(CHILD_COOKIE, { path: '/' });
    return reply.send({ ok: true });
  });

  app.get('/auth/me', { preHandler: guards.requireAuth }, async (req) => {
    const a = req.auth!;
    return {
      userId: a.userId,
      role: a.role,
      familyId: a.familyId,
      kind: a.kind,
      childProfileId: a.childProfileId,
      pinVerified: !!a.pinVerifiedAt && Date.now() - a.pinVerifiedAt.getTime() < 15 * 60 * 1000,
    };
  });

  app.post('/auth/parent-pin/verify', { preHandler: guards.requireParent }, async (req, reply) => {
    const body = z.object({ pin: z.string() }).parse(req.body);
    const ok = await verifyPin(db, req.auth!.userId, req.auth!.sessionId, body.pin);
    if (!ok) return reply.code(401).send({ error: 'invalid_pin' });
    return reply.send({ ok: true });
  });
}
