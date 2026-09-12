import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { authSession, family, user } from '../db/schema.js';
import { hashSecret, newId, newSessionToken, verifySecret } from './crypto.js';
import { writeAudit } from '../audit.js';

export const PARENT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const CHILD_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

async function issueSession(
  db: Database,
  opts: {
    userId: string;
    kind: 'PARENT' | 'CHILD' | 'TEACHER' | 'MENTOR';
    ttlMs: number;
    parentSessionId?: string;
    childProfileId?: string;
  },
): Promise<IssuedSession> {
  const { token, tokenHash } = newSessionToken();
  const sessionId = newId('sess');
  const expiresAt = new Date(Date.now() + opts.ttlMs);
  await db.insert(authSession).values({
    id: sessionId,
    userId: opts.userId,
    kind: opts.kind,
    parentSessionId: opts.parentSessionId ?? null,
    childProfileId: opts.childProfileId ?? null,
    tokenHash,
    expiresAt,
  });
  return { token, sessionId, expiresAt };
}

export interface RegisterInput {
  email: string;
  password: string;
  familyName: string;
  displayName: string;
  pin: string;
}

export async function registerFamily(db: Database, input: RegisterInput): Promise<IssuedSession> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, input.email));
  if (existing.length > 0) {
    throw Object.assign(new Error('email_taken'), { statusCode: 409 });
  }

  const familyId = newId('fam');
  const userId = newId('usr');

  await db.insert(family).values({ id: familyId, name: input.familyName });
  await db.insert(user).values({
    id: userId,
    familyId,
    role: 'FAMILY_OWNER',
    email: input.email,
    passwordHash: await hashSecret(input.password),
    displayName: input.displayName,
    pinHash: await hashSecret(input.pin),
  });

  await writeAudit(db, {
    actorUserId: userId,
    actorRole: 'FAMILY_OWNER',
    action: 'family.registered',
    resourceType: 'family',
    resourceId: familyId,
    familyId,
  });

  return issueSession(db, { userId, kind: 'PARENT', ttlMs: PARENT_SESSION_TTL_MS });
}

export async function login(db: Database, email: string, password: string): Promise<IssuedSession> {
  const rows = await db
    .select({ id: user.id, passwordHash: user.passwordHash, role: user.role, familyId: user.familyId })
    .from(user)
    .where(eq(user.email, email));
  const u = rows[0];
  if (!u || !(await verifySecret(password, u.passwordHash))) {
    throw Object.assign(new Error('invalid_credentials'), { statusCode: 401 });
  }
  await writeAudit(db, {
    actorUserId: u.id,
    actorRole: u.role,
    action: 'auth.login',
    resourceType: 'user',
    resourceId: u.id,
    familyId: u.familyId,
  });
  const kind = u.role === 'TEACHER' ? 'TEACHER' : u.role === 'MENTOR' ? 'MENTOR' : 'PARENT';
  return issueSession(db, { userId: u.id, kind, ttlMs: PARENT_SESSION_TTL_MS });
}

export interface RegisterEducatorInput {
  email: string;
  password: string;
  displayName: string;
  role: 'TEACHER' | 'MENTOR';
}

/** Người dùng giáo viên/cố vấn — KHÔNG thuộc family nào (`familyId` null), không có PIN. */
export async function registerEducator(db: Database, input: RegisterEducatorInput): Promise<IssuedSession> {
  const existing = await db.select({ id: user.id }).from(user).where(eq(user.email, input.email));
  if (existing.length > 0) {
    throw Object.assign(new Error('email_taken'), { statusCode: 409 });
  }
  const userId = newId('usr');
  await db.insert(user).values({
    id: userId,
    familyId: null,
    role: input.role,
    email: input.email,
    passwordHash: await hashSecret(input.password),
    displayName: input.displayName,
  });
  await writeAudit(db, {
    actorUserId: userId,
    actorRole: input.role,
    action: 'educator.registered',
    resourceType: 'user',
    resourceId: userId,
    familyId: null,
  });
  return issueSession(db, { userId, kind: input.role, ttlMs: PARENT_SESSION_TTL_MS });
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.update(authSession).set({ revokedAt: new Date() }).where(eq(authSession.id, sessionId));
}

export async function verifyPin(
  db: Database,
  userId: string,
  sessionId: string,
  pin: string,
): Promise<boolean> {
  const rows = await db.select({ pinHash: user.pinHash, role: user.role, familyId: user.familyId }).from(user).where(eq(user.id, userId));
  const u = rows[0];
  if (!u?.pinHash || !(await verifySecret(pin, u.pinHash))) return false;
  await db.update(authSession).set({ pinVerifiedAt: new Date() }).where(eq(authSession.id, sessionId));
  await writeAudit(db, {
    actorUserId: userId,
    actorRole: u.role,
    action: 'auth.pin_verified',
    resourceType: 'auth_session',
    resourceId: sessionId,
    familyId: u.familyId,
  });
  return true;
}

/** Phụ huynh mở phiên cho trẻ. Child session TTL ngắn, không nâng quyền (ADR 0004). */
export async function openChildSession(
  db: Database,
  parentAuth: { userId: string; sessionId: string; role: string; familyId: string | null },
  childProfileId: string,
): Promise<IssuedSession> {
  const issued = await issueSession(db, {
    userId: parentAuth.userId,
    kind: 'CHILD',
    ttlMs: CHILD_SESSION_TTL_MS,
    parentSessionId: parentAuth.sessionId,
    childProfileId,
  });
  await writeAudit(db, {
    actorUserId: parentAuth.userId,
    actorRole: parentAuth.role,
    action: 'child_session.opened',
    resourceType: 'child_profile',
    resourceId: childProfileId,
    familyId: parentAuth.familyId,
  });
  return issued;
}

export async function activeChildSessionCount(db: Database, childProfileId: string): Promise<number> {
  const rows = await db
    .select({ id: authSession.id })
    .from(authSession)
    .where(and(eq(authSession.childProfileId, childProfileId), isNull(authSession.revokedAt)));
  return rows.length;
}
