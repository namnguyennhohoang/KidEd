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
const UNIT = 'vi-g1-math-number-bonds-001';

beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.close();
});

async function completeSession(childToken: string, cg: string) {
  const start = await h.app.inject({
    method: 'POST',
    url: '/sessions',
    headers: bearer(childToken),
    payload: { learningUnitId: UNIT, clientGeneratedId: cg },
  });
  const sid = start.json().id as string;
  const att = await h.app.inject({
    method: 'POST',
    url: `/sessions/${sid}/attempts`,
    headers: bearer(childToken),
    payload: { content: { text: 'thử' } },
  });
  await h.app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: bearer(childToken) });
  return { sid, attemptOrdinal: att.json().ordinal as number };
}

describe('Error taxonomy + readiness-by-skill (Module C)', () => {
  it('GET /learning/error-causes -> 9 nguyên nhân', async () => {
    const { token } = await registerParent(h.app);
    const res = await h.app.inject({ method: 'GET', url: '/learning/error-causes', headers: bearer(token) });
    expect(res.json().causes).toHaveLength(9);
    expect(res.json().causes.map((c: { code: string }) => c.code)).toContain('MISCONCEPTION');
  });

  it('phụ huynh phân loại lỗi cho một lần thử -> lưu + vào readiness', async () => {
    const { token, pin } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    const { sid } = await completeSession(childToken, 'cg-rd-1');

    // lấy attempt id thực tế
    const att = await h.db.execute(sql.raw(`select id from attempt where session_id='${sid}' limit 1`));
    const attemptId = (att.rows[0] as { id: string }).id;

    const cls = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/attempts/${attemptId}/error`,
      headers: bearer(token),
      payload: { cause: 'QUESTION_LANGUAGE', skillId: 'MATH_NUMBER_SENSE', note: 'bé chưa hiểu từ "tách"' },
    });
    expect(cls.statusCode).toBe(201);

    const bad = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/attempts/${attemptId}/error`,
      headers: bearer(token),
      payload: { cause: 'KHONG_CO_THAT' },
    });
    expect(bad.statusCode).toBe(400);

    await verifyPin(h.app, token, pin);
    const rd = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/readiness?overlay=TDN_GRADE_6`,
      headers: bearer(token),
    });
    expect(rd.statusCode).toBe(200);
    const body = rd.json();
    expect(body.overlay).toBe('TDN_GRADE_6');
    expect(body.disclaimer).toMatch(/không phải xếp hạng/i);
    const ns = body.bySkill.find((s: { skillId: string }) => s.skillId === 'MATH_NUMBER_SENSE');
    expect(ns.errorCauses.QUESTION_LANGUAGE).toBe(1);
    expect(['EMERGING', 'DEVELOPING', 'SECURE']).toContain(ns.band);
    expect(['LOW', 'MED', 'HIGH']).toContain(ns.confidence);
    // Không có trường xếp hạng / dự báo
    const json = JSON.stringify(body).toLowerCase();
    for (const banned of ['rank', 'percentile', 'pass_probability', 'admit_chance', '"iq"']) {
      expect(json.includes(banned)).toBe(false);
    }
  });

  it('nhiều minh chứng độc lập + không misconception -> band tiến tới DEVELOPING/SECURE', async () => {
    const { token, pin } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    for (let i = 0; i < 4; i++) await completeSession(childToken, `cg-rd-band-${i}`);

    await verifyPin(h.app, token, pin);
    const rd = await h.app.inject({ method: 'GET', url: `/children/${childId}/readiness`, headers: bearer(token) });
    const ns = rd.json().bySkill.find((s: { skillId: string }) => s.skillId === 'MATH_NUMBER_SENSE');
    // 4 phiên hoàn thành, 0 hint -> strength DEVELOPING, evidence >= 4
    expect(ns.evidenceCount).toBeGreaterThanOrEqual(4);
    expect(['DEVELOPING', 'SECURE']).toContain(ns.band);
    expect(rd.json().summary.skillsTracked).toBeGreaterThanOrEqual(3);
  });

  it('readiness lọc theo overlay -> chỉ kỹ năng của overlay + đánh dấu notStarted', async () => {
    const { token, pin } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    await completeSession(childToken, 'cg-rd-ovl-1'); // sinh evidence cho MATH_NUMBER_SENSE, ORAL_EXPLANATION...

    await verifyPin(h.app, token, pin);
    const rd = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/readiness?overlay=TDN_GRADE_6`,
      headers: bearer(token),
    });
    const body = rd.json();
    // Mọi kỹ năng trả về đều thuộc overlay TDN_GRADE_6 (có title từ skill graph).
    expect(body.bySkill.length).toBeGreaterThanOrEqual(5);
    expect(body.bySkill.every((s: { title: string | null }) => s.title !== null)).toBe(true);
    // Kỹ năng chưa đụng tới -> notStarted
    const eng = body.bySkill.find((s: { skillId: string }) => s.skillId === 'ENGLISH_WRITING');
    expect(eng.notStarted).toBe(true);
    expect(body.summary.notStarted).toBeGreaterThanOrEqual(1);
  });

  it('GET /learning/skills lọc theo overlay/group', async () => {
    const { token } = await registerParent(h.app);
    const all = await h.app.inject({ method: 'GET', url: '/learning/skills', headers: bearer(token) });
    expect(all.json().skills.length).toBeGreaterThanOrEqual(15);
    const tdn = await h.app.inject({
      method: 'GET',
      url: '/learning/skills?overlay=TDN_GRADE_6&group=ACADEMIC',
      headers: bearer(token),
    });
    expect(tdn.json().skills.every((s: { group: string; overlays: string[] }) => s.group === 'ACADEMIC' && s.overlays.includes('TDN_GRADE_6'))).toBe(true);
  });

  it('readiness của trẻ family khác -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const childA = await createChild(h.app, a.token);
    await verifyPin(h.app, b.token, b.pin);
    const res = await h.app.inject({
      method: 'GET',
      url: `/children/${childA}/readiness`,
      headers: bearer(b.token),
    });
    expect(res.statusCode).toBe(404);
  });

  it('child ở EXPLORER thấy pack lớp 3', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    await h.db.execute(sql.raw(`update child_profile set current_stage='EXPLORER' where id='${childId}'`));
    const childToken = await openChildSession(h.app, token, childId);
    const res = await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(childToken) });
    expect(res.json().packs.some((p: { id: string }) => p.id === 'vi-g3-explorer-starter')).toBe(true);
  });
});
