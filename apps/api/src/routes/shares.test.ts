import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  makeHarness,
  registerParent,
  createChild,
  openChildSession,
  verifyPin,
  bearer,
  type Harness,
} from '../test-support/harness.js';

let h: Harness;
let parentToken: string;
let childId: string;
const PIN = '246813';
const UNIT = 'vi-g1-math-number-bonds-001';

beforeAll(async () => {
  h = await makeHarness();
  parentToken = (await registerParent(h.app, { pin: PIN })).token;
  childId = await createChild(h.app, parentToken);
  const ct = await openChildSession(h.app, parentToken, childId);
  await h.app.inject({
    method: 'POST',
    url: '/sessions/sync',
    headers: bearer(ct),
    payload: { session: { clientGeneratedId: 'cg-shr-1', learningUnitId: UNIT, startedAt: new Date().toISOString() }, completed: true },
  });
});
afterAll(async () => {
  await h.close();
});

const auth = () => bearer(parentToken);
const withShare = (token: string) => ({ 'x-share-token': token });

async function makeShare(scope: Record<string, boolean>, over: Record<string, unknown> = {}) {
  const r = await h.app.inject({
    method: 'POST',
    url: `/children/${childId}/shares`,
    headers: auth(),
    payload: { role: 'TEACHER', scope, label: 'Cô Lan', ...over },
  });
  return r;
}

describe('Chia sẻ chỉ-đọc cho giáo viên/cố vấn (LINK)', () => {
  it('scope rỗng -> 422', async () => {
    const r = await makeShare({});
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe('empty_scope');
  });

  it('tạo link -> token trả về một lần; resolve + đọc mục trong phạm vi; mục ngoài phạm vi -> 403', async () => {
    const created = await makeShare({ readiness: true, dashboard: true }, { expiresDays: 30 });
    expect(created.statusCode).toBe(201);
    const token = created.json().token as string;
    expect(token.length).toBeGreaterThan(20);

    const resolve = await h.app.inject({ method: 'GET', url: '/shared/resolve', headers: withShare(token) });
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json().role).toBe('TEACHER');
    expect(resolve.json().scope).toMatchObject({ readiness: true, scholar: false });

    const rd = await h.app.inject({ method: 'GET', url: '/shared/readiness', headers: withShare(token) });
    expect(rd.statusCode).toBe(200);
    expect(Array.isArray(rd.json().bySkill)).toBe(true);

    const dash = await h.app.inject({ method: 'GET', url: '/shared/dashboard', headers: withShare(token) });
    expect(dash.statusCode).toBe(200);

    const sc = await h.app.inject({ method: 'GET', url: '/shared/scholar', headers: withShare(token) });
    expect(sc.statusCode).toBe(403);
    expect(sc.json().error).toBe('section_not_shared');
  });

  it('token sai / thiếu -> 401', async () => {
    expect((await h.app.inject({ method: 'GET', url: '/shared/readiness' })).statusCode).toBe(401);
    expect(
      (await h.app.inject({ method: 'GET', url: '/shared/readiness', headers: withShare('khong-hop-le-xxxxxxxxxx') })).statusCode,
    ).toBe(401);
  });

  it('danh sách share cần PIN; thu hồi -> link chết (401)', async () => {
    const created = await makeShare({ specialisation: true });
    const shareId = created.json().id as string;
    const token = created.json().token as string;

    const noPin = await h.app.inject({ method: 'GET', url: `/children/${childId}/shares`, headers: auth() });
    expect(noPin.statusCode).toBe(403);
    await verifyPin(h.app, parentToken, PIN);
    const list = await h.app.inject({ method: 'GET', url: `/children/${childId}/shares`, headers: auth() });
    expect(list.json().shares.some((s: { id: string }) => s.id === shareId)).toBe(true);
    // Không lộ token/hash trong danh sách.
    expect(JSON.stringify(list.json())).not.toContain('tokenHash');
    expect(JSON.stringify(list.json())).not.toContain(token);

    expect((await h.app.inject({ method: 'GET', url: '/shared/specialisation', headers: withShare(token) })).statusCode).toBe(200);
    const rev = await h.app.inject({ method: 'POST', url: `/shares/${shareId}/revoke`, headers: auth() });
    expect(rev.statusCode).toBe(200);
    expect((await h.app.inject({ method: 'GET', url: '/shared/specialisation', headers: withShare(token) })).statusCode).toBe(401);
  });

  it('link hết hạn -> 401', async () => {
    const created = await makeShare({ readiness: true }, { expiresDays: 1 });
    const id = created.json().id as string;
    const token = created.json().token as string;
    await h.db.execute(sql.raw(`update educator_share set expires_at = now() - interval '2 days' where id = '${id}'`));
    expect((await h.app.inject({ method: 'GET', url: '/shared/readiness', headers: withShare(token) })).statusCode).toBe(401);
  });

  it('family khác không tạo/không thu hồi share của trẻ mình', async () => {
    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    const mine = await makeShare({ readiness: true });
    const rev = await h.app.inject({
      method: 'POST',
      url: `/shares/${mine.json().id}/revoke`,
      headers: bearer(other.token),
    });
    expect(rev.statusCode).toBe(404);
    const cross = await h.app.inject({
      method: 'POST',
      url: `/children/${otherChild}/shares`,
      headers: auth(),
      payload: { role: 'MENTOR', scope: { readiness: true } },
    });
    expect(cross.statusCode).toBe(404);
  });
});

async function registerEducator(email: string, role: 'TEACHER' | 'MENTOR' = 'TEACHER') {
  const r = await h.app.inject({
    method: 'POST',
    url: '/auth/register-educator',
    payload: { email, password: 'correct horse battery', displayName: 'Cô Giáo', role },
  });
  if (r.statusCode !== 201) throw new Error(`register-educator failed: ${r.statusCode} ${r.body}`);
  return r.json().token as string;
}

describe('Tài khoản giáo viên/cố vấn (ACCOUNT)', () => {
  it('mời -> đăng ký educator -> nhận lời -> đọc mục trong phạm vi; ngoài phạm vi -> 403', async () => {
    const email = `edu_${Date.now()}@example.test`;
    const invite = await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/educators`,
      headers: auth(),
      payload: { email, role: 'TEACHER', scope: { readiness: true, dashboard: true }, label: 'GVCN' },
    });
    expect(invite.statusCode).toBe(201);
    const code = invite.json().inviteCode as string;

    const eduToken = await registerEducator(email);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(eduToken) });
    expect(me.json().kind).toBe('TEACHER');

    const accept = await h.app.inject({
      method: 'POST',
      url: '/educator/invites/accept',
      headers: bearer(eduToken),
      payload: { code },
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().status).toBe('ACTIVE');

    const list = await h.app.inject({ method: 'GET', url: '/educator/children', headers: bearer(eduToken) });
    expect(list.json().children.map((c: { childProfileId: string }) => c.childProfileId)).toContain(childId);

    const rd = await h.app.inject({
      method: 'GET',
      url: `/educator/children/${childId}/readiness`,
      headers: bearer(eduToken),
    });
    expect(rd.statusCode).toBe(200);
    expect(Array.isArray(rd.json().bySkill)).toBe(true);

    const sc = await h.app.inject({
      method: 'GET',
      url: `/educator/children/${childId}/scholar`,
      headers: bearer(eduToken),
    });
    expect(sc.statusCode).toBe(403);
  });

  it('mã sai -> 404; email không khớp -> 403; phụ huynh gọi /educator/* -> 403', async () => {
    const email = `edu2_${Date.now()}@example.test`;
    const invite = await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/educators`,
      headers: auth(),
      payload: { email, role: 'MENTOR', scope: { specialisation: true } },
    });
    const code = invite.json().inviteCode as string;

    const wrongEdu = await registerEducator(`someone_else_${Date.now()}@example.test`, 'MENTOR');
    const mism = await h.app.inject({
      method: 'POST',
      url: '/educator/invites/accept',
      headers: bearer(wrongEdu),
      payload: { code },
    });
    expect(mism.statusCode).toBe(403);
    expect(mism.json().error).toBe('invite_email_mismatch');

    const rightEdu = await registerEducator(email, 'MENTOR');
    const bad = await h.app.inject({
      method: 'POST',
      url: '/educator/invites/accept',
      headers: bearer(rightEdu),
      payload: { code: 'khong-ton-tai-xxxxxx' },
    });
    expect(bad.statusCode).toBe(404);

    const parentHit = await h.app.inject({ method: 'GET', url: '/educator/children', headers: auth() });
    expect(parentHit.statusCode).toBe(403);
  });

  it('phụ huynh thu hồi -> educator mất quyền đọc (404 not_shared)', async () => {
    const email = `edu3_${Date.now()}@example.test`;
    const invite = await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/educators`,
      headers: auth(),
      payload: { email, role: 'TEACHER', scope: { readiness: true } },
    });
    const shareId = invite.json().id as string;
    const eduToken = await registerEducator(email);
    await h.app.inject({
      method: 'POST',
      url: '/educator/invites/accept',
      headers: bearer(eduToken),
      payload: { code: invite.json().inviteCode },
    });
    expect(
      (await h.app.inject({ method: 'GET', url: `/educator/children/${childId}/readiness`, headers: bearer(eduToken) })).statusCode,
    ).toBe(200);

    await h.app.inject({ method: 'POST', url: `/shares/${shareId}/revoke`, headers: auth() });
    expect(
      (await h.app.inject({ method: 'GET', url: `/educator/children/${childId}/readiness`, headers: bearer(eduToken) })).statusCode,
    ).toBe(404);
    const list = await h.app.inject({ method: 'GET', url: '/educator/children', headers: bearer(eduToken) });
    expect(list.json().children.length).toBe(0);
  });
});
