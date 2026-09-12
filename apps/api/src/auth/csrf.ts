import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE, CHILD_COOKIE } from './context.js';

/**
 * CSRF double-submit cookie (AUDIT_PHASE1 SEC-6).
 * Chỉ áp dụng khi xác thực bằng COOKIE + method thay đổi trạng thái.
 * Bearer token (test / client không cookie) được miễn.
 */
export const CSRF_COOKIE = 'tiny_csrf';
const HEADER = 'x-csrf-token';

const EXEMPT_PATHS = new Set(['/auth/login', '/auth/register']);
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function issueCsrf(reply: FastifyReply, isProd: boolean): string {
  const token = randomBytes(24).toString('hex');
  reply.setCookie(CSRF_COOKIE, token, {
    httpOnly: false, // client cần đọc để gửi lại trong header
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return token;
}

export function csrfHook(req: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void): void {
  if (!MUTATING.has(req.method)) return done();
  if (EXEMPT_PATHS.has(req.url.split('?')[0] ?? req.url)) return done();

  const hasSessionCookie = !!(req.cookies?.[SESSION_COOKIE] || req.cookies?.[CHILD_COOKIE]);
  const hasBearer = (req.headers.authorization ?? '').startsWith('Bearer ');
  if (!hasSessionCookie || hasBearer) return done(); // không dùng cookie -> không cần CSRF

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[HEADER];
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    reply.code(403).send({ error: 'csrf_failed' });
    return;
  }
  done();
}
