import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from '../test-support/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.close();
});

/** Đăng ký và lấy cookie phiên + cookie csrf từ Set-Cookie. */
async function registerWithCookies() {
  const res = await h.app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email: `csrf_${Date.now()}@example.test`,
      password: 'correct horse battery',
      familyName: 'F',
      displayName: 'P',
      pin: '246813',
    },
  });
  const setCookies = res.headers['set-cookie'] as string[] | string;
  const list = Array.isArray(setCookies) ? setCookies : [setCookies];
  const jar: Record<string, string> = {};
  for (const c of list) {
    const [pair] = c.split(';');
    const [k, v] = pair!.split('=');
    jar[k!.trim()] = v!;
  }
  return jar; // { tiny_session, tiny_csrf }
}

describe('CSRF double-submit (SEC-6)', () => {
  it('POST bằng cookie KHÔNG kèm x-csrf-token -> 403', async () => {
    const jar = await registerWithCookies();
    const res = await h.app.inject({
      method: 'POST',
      url: '/children',
      cookies: { tiny_session: jar.tiny_session!, tiny_csrf: jar.tiny_csrf! },
      payload: { displayName: 'Bé', birthMonth: 1, birthYear: 2020 },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('csrf_failed');
  });

  it('POST bằng cookie + x-csrf-token đúng -> qua', async () => {
    const jar = await registerWithCookies();
    const res = await h.app.inject({
      method: 'POST',
      url: '/children',
      cookies: { tiny_session: jar.tiny_session!, tiny_csrf: jar.tiny_csrf! },
      headers: { 'x-csrf-token': jar.tiny_csrf! },
      payload: { displayName: 'Bé', birthMonth: 1, birthYear: 2020 },
    });
    expect(res.statusCode).toBe(201);
  });

  it('token header sai -> 403', async () => {
    const jar = await registerWithCookies();
    const res = await h.app.inject({
      method: 'POST',
      url: '/children',
      cookies: { tiny_session: jar.tiny_session!, tiny_csrf: jar.tiny_csrf! },
      headers: { 'x-csrf-token': 'sai' },
      payload: { displayName: 'Bé', birthMonth: 1, birthYear: 2020 },
    });
    expect(res.statusCode).toBe(403);
  });

  it('Bearer token (không cookie) -> miễn CSRF', async () => {
    const reg = await h.app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: `csrf_bearer_${Date.now()}@example.test`,
        password: 'correct horse battery',
        familyName: 'F',
        displayName: 'P',
        pin: '246813',
      },
    });
    const token = reg.json().token as string;
    const res = await h.app.inject({
      method: 'POST',
      url: '/children',
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: 'Bé', birthMonth: 1, birthYear: 2020 },
    });
    expect(res.statusCode).toBe(201);
  });

  it('GET không cần CSRF', async () => {
    const jar = await registerWithCookies();
    const res = await h.app.inject({
      method: 'GET',
      url: '/children',
      cookies: { tiny_session: jar.tiny_session!, tiny_csrf: jar.tiny_csrf! },
    });
    expect(res.statusCode).toBe(200);
  });
});
