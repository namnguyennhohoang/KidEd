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

beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.close();
});

describe('đăng ký / đăng nhập / đăng xuất', () => {
  it('đăng ký -> 201 + token; /auth/me trả kind=PARENT', async () => {
    const { token } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    expect(me.json().kind).toBe('PARENT');
    expect(me.json().familyId).toMatch(/^fam_/);
  });

  it('đăng ký trùng email -> 409', async () => {
    const email = `dup_${Date.now()}@example.test`;
    await registerParent(h.app, { email });
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email,
        password: 'correct horse battery',
        familyName: 'X',
        displayName: 'Y',
        pin: '111111',
      },
    });
    expect(res.statusCode).toBe(409);
  });

  it('đăng nhập sai mật khẩu -> 401', async () => {
    const { email } = await registerParent(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'sai mật khẩu' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('5 lần sai mật khẩu -> khóa mềm 429; mật khẩu đúng trong lúc khóa vẫn 429', async () => {
    const { email } = await registerParent(h.app);
    const wrong = { email, password: 'sai' };
    for (let i = 0; i < 4; i++) {
      const r = await h.app.inject({ method: 'POST', url: '/auth/login', payload: wrong });
      expect(r.statusCode).toBe(401);
    }
    const fifth = await h.app.inject({ method: 'POST', url: '/auth/login', payload: wrong });
    expect(fifth.statusCode).toBe(429);
    expect(fifth.json().error).toBe('too_many_attempts');

    const correct = await h.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password: 'correct horse battery' },
    });
    expect(correct.statusCode).toBe(429);
  });

  it('đăng xuất -> token bị thu hồi', async () => {
    const { token } = await registerParent(h.app);
    await h.app.inject({ method: 'POST', url: '/auth/logout', headers: bearer(token) });
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    expect(me.statusCode).toBe(401);
  });

  it('phản hồi không lộ mật khẩu / pin / hash', async () => {
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `leak_${Date.now()}@example.test`,
        password: 'correct horse battery',
        familyName: 'X',
        displayName: 'Y',
        pin: '123456',
      },
    });
    expect(res.body).not.toContain('correct horse battery');
    expect(res.body).not.toContain('123456');
    expect(res.body).not.toContain('scrypt$');
  });
});

describe('tạo hồ sơ trẻ + consent + audit', () => {
  it('tạo trẻ -> xuất hiện trong /children, thuộc đúng family, có consent DATA_PROCESSING', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token, {
      displayName: 'Bi',
      interests: [{ source: 'PARENT', label: 'vẽ' }],
      consents: { voiceRecording: true },
    });

    const list = await h.app.inject({ method: 'GET', url: '/children', headers: bearer(token) });
    expect(list.json().children.map((c: { id: string }) => c.id)).toContain(childId);

    const cRows = await h.db.execute(
      sql.raw(`select type from consent where child_profile_id = '${childId}' order by type`),
    );
    const types = cRows.rows.map((r) => (r as { type: string }).type);
    expect(types).toContain('DATA_PROCESSING');
    expect(types).toContain('VOICE_RECORDING');

    const aRows = await h.db.execute(
      sql.raw(`select count(*)::int n from audit_log where action = 'child_profile.created'`),
    );
    expect((aRows.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });
});

describe('IDOR / BOLA — cô lập theo family', () => {
  it('phụ huynh family B không đọc được hồ sơ trẻ của family A -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const childA = await createChild(h.app, a.token);

    const res = await h.app.inject({
      method: 'GET',
      url: `/children/${childA}`,
      headers: bearer(b.token),
    });
    expect(res.statusCode).toBe(404);

    const okOwn = await h.app.inject({
      method: 'GET',
      url: `/children/${childA}`,
      headers: bearer(a.token),
    });
    expect(okOwn.statusCode).toBe(200);
  });

  it('family B không PATCH được hồ sơ trẻ của family A -> 404, dữ liệu không đổi', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const childA = await createChild(h.app, a.token, { displayName: 'Nguyên' });

    const res = await h.app.inject({
      method: 'PATCH',
      url: `/children/${childA}`,
      headers: bearer(b.token),
      payload: { displayName: 'Bị đổi' },
    });
    expect(res.statusCode).toBe(404);

    const check = await h.app.inject({
      method: 'GET',
      url: `/children/${childA}`,
      headers: bearer(a.token),
    });
    expect(check.json().child.displayName).toBe('Nguyên');
  });

  it('family B không mở được child session cho trẻ của family A -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const childA = await createChild(h.app, a.token);
    const res = await h.app.inject({
      method: 'POST',
      url: `/children/${childA}/child-session`,
      headers: bearer(b.token),
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('cô lập child session (threat T1)', () => {
  it('child session KHÔNG truy cập được /children/:id/dashboard -> 403', async () => {
    const { token: parentToken } = await registerParent(h.app);
    const childId = await createChild(h.app, parentToken);
    await verifyPin(h.app, parentToken, '246813');
    const childToken = await openChildSession(h.app, parentToken, childId);

    const res = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/dashboard`,
      headers: bearer(childToken),
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().reason).toBe('parent_session_required');
  });

  it('child session KHÔNG tạo được hồ sơ trẻ -> 403', async () => {
    const { token: parentToken } = await registerParent(h.app);
    const childId = await createChild(h.app, parentToken);
    const childToken = await openChildSession(h.app, parentToken, childId);
    const res = await h.app.inject({
      method: 'POST',
      url: '/children',
      headers: bearer(childToken),
      payload: { displayName: 'X', birthMonth: 1, birthYear: 2020 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('child session ĐƯỢC đọc nội dung học -> 200', async () => {
    const { token: parentToken } = await registerParent(h.app);
    const childId = await createChild(h.app, parentToken);
    const childToken = await openChildSession(h.app, parentToken, childId);
    const res = await h.app.inject({
      method: 'GET',
      url: '/content/units/vi-g1-math-number-bonds-001',
      headers: bearer(childToken),
    });
    expect(res.statusCode).toBe(200);
  });

  it('/auth/me của child session trả kind=CHILD + childProfileId', async () => {
    const { token: parentToken } = await registerParent(h.app);
    const childId = await createChild(h.app, parentToken);
    const childToken = await openChildSession(h.app, parentToken, childId);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(childToken) });
    expect(me.json().kind).toBe('CHILD');
    expect(me.json().childProfileId).toBe(childId);
  });

  it('POST /child-session/end thu hồi phiên trẻ', async () => {
    const { token: parentToken } = await registerParent(h.app);
    const childId = await createChild(h.app, parentToken);
    const childToken = await openChildSession(h.app, parentToken, childId);

    const end = await h.app.inject({
      method: 'POST',
      url: '/child-session/end',
      headers: bearer(childToken),
    });
    expect(end.statusCode).toBe(200);

    const after = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(childToken) });
    expect(after.statusCode).toBe(401);
  });
});

describe('PIN gate Parent Dashboard (ADR 0004)', () => {
  it('chưa xác thực PIN -> 403 pin_verification_required; sau khi xác thực -> 200', async () => {
    const { token, pin } = await registerParent(h.app);
    const childId = await createChild(h.app, token);

    const before = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/dashboard`,
      headers: bearer(token),
    });
    expect(before.statusCode).toBe(403);
    expect(before.json().reason).toBe('pin_verification_required');

    await verifyPin(h.app, token, pin);

    const after = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/dashboard`,
      headers: bearer(token),
    });
    expect(after.statusCode).toBe(200);
    expect(after.json().dashboard).toBeTruthy();
    expect(after.json().dashboard.independence.completedSessions).toBe(0);
  });

  it('PIN sai -> 401', async () => {
    const { token } = await registerParent(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/auth/parent-pin/verify',
      headers: bearer(token),
      payload: { pin: '000000' },
    });
    expect(res.statusCode).toBe(401);
  });
});
