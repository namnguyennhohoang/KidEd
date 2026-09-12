import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { authSession, user } from '../db/schema.js';
import { hashToken } from './crypto.js';

export const SESSION_COOKIE = 'tiny_session';
export const CHILD_COOKIE = 'tiny_child';

/** PIN mở dashboard có hiệu lực trong khoảng này rồi phải nhập lại. */
export const PIN_TTL_MS = 15 * 60 * 1000;

export type SessionKind = 'PARENT' | 'CHILD' | 'TEACHER' | 'MENTOR';

export interface AuthContext {
  sessionId: string;
  userId: string;
  role: string;
  familyId: string | null;
  kind: SessionKind;
  childProfileId: string | null;
  pinVerifiedAt: Date | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

function extractToken(req: FastifyRequest): string | null {
  // Ưu tiên child cookie: khi thiết bị đang ở chế độ trẻ, phiên trẻ "phủ" lên phiên phụ huynh.
  const cookieToken = req.cookies?.[CHILD_COOKIE] ?? req.cookies?.[SESSION_COOKIE];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return null;
}

/** Tra phiên từ cookie/bearer. Trả null nếu không có / hết hạn / bị thu hồi. */
export async function resolveAuth(db: Database, req: FastifyRequest): Promise<AuthContext | null> {
  const token = extractToken(req);
  if (!token) return null;

  const rows = await db
    .select({
      sessionId: authSession.id,
      userId: authSession.userId,
      kind: authSession.kind,
      childProfileId: authSession.childProfileId,
      pinVerifiedAt: authSession.pinVerifiedAt,
      role: user.role,
      familyId: user.familyId,
    })
    .from(authSession)
    .innerJoin(user, eq(user.id, authSession.userId))
    .where(
      and(
        eq(authSession.tokenHash, hashToken(token)),
        isNull(authSession.revokedAt),
        gt(authSession.expiresAt, new Date()),
      ),
    );

  const row = rows[0];
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    userId: row.userId,
    role: row.role,
    familyId: row.familyId,
    kind: row.kind as SessionKind,
    childProfileId: row.childProfileId,
    pinVerifiedAt: row.pinVerifiedAt,
  };
}

/* ─── preHandler guards ─── */

export function makeGuards(db: Database) {
  async function loadAuth(req: FastifyRequest): Promise<AuthContext | null> {
    if (!req.auth) {
      const ctx = await resolveAuth(db, req);
      if (ctx) req.auth = ctx;
    }
    return req.auth ?? null;
  }

  const requireAuth = async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await loadAuth(req);
    if (!ctx) return reply.code(401).send({ error: 'unauthenticated' });
  };

  /** Chỉ phiên phụ huynh. Child session -> 403 (ADR 0004, threat T1). */
  const requireParent = async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await loadAuth(req);
    if (!ctx) return reply.code(401).send({ error: 'unauthenticated' });
    if (ctx.kind !== 'PARENT') {
      return reply.code(403).send({ error: 'forbidden', reason: 'parent_session_required' });
    }
  };

  /** Chỉ phiên trẻ (child mode trên thiết bị). */
  const requireChild = async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await loadAuth(req);
    if (!ctx) return reply.code(401).send({ error: 'unauthenticated' });
    if (ctx.kind !== 'CHILD' || !ctx.childProfileId) {
      return reply.code(403).send({ error: 'forbidden', reason: 'child_session_required' });
    }
  };

  /** Parent Dashboard: cần đã xác thực PIN gần đây (ADR 0004). */
  const requirePinVerified = async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await loadAuth(req);
    if (!ctx) return reply.code(401).send({ error: 'unauthenticated' });
    if (ctx.kind !== 'PARENT') {
      return reply.code(403).send({ error: 'forbidden', reason: 'parent_session_required' });
    }
    const ok = ctx.pinVerifiedAt && Date.now() - ctx.pinVerifiedAt.getTime() < PIN_TTL_MS;
    if (!ok) return reply.code(403).send({ error: 'forbidden', reason: 'pin_verification_required' });
  };

  /** Chỉ phiên giáo viên/cố vấn (tài khoản educator, không thuộc family). */
  const requireEducator = async (req: FastifyRequest, reply: FastifyReply) => {
    const ctx = await loadAuth(req);
    if (!ctx) return reply.code(401).send({ error: 'unauthenticated' });
    if (ctx.kind !== 'TEACHER' && ctx.kind !== 'MENTOR') {
      return reply.code(403).send({ error: 'forbidden', reason: 'educator_session_required' });
    }
  };

  return { loadAuth, requireAuth, requireParent, requireChild, requirePinVerified, requireEducator };
}

export type Guards = ReturnType<typeof makeGuards>;

/**
 * Object-level authorization: tài nguyên phải thuộc family của người gọi.
 * Trả 404 (không lộ tồn tại) khi khác family — chống IDOR/BOLA (threat T2).
 */
export function assertFamilyAccess(reply: FastifyReply, auth: AuthContext, resourceFamilyId: string | null): boolean {
  if (!resourceFamilyId || auth.familyId !== resourceFamilyId) {
    reply.code(404).send({ error: 'not_found' });
    return false;
  }
  return true;
}
