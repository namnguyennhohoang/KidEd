import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { sql } from 'drizzle-orm';
import {
  makeHarness,
  registerParent,
  createChild,
  openChildSession,
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

describe('Content authz — child chỉ thấy nội dung đúng stage (SEC-5)', () => {
  it('child ở EXPLORER không thấy pack BASE_CAMP; parent thì thấy tất cả', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    // đưa trẻ sang stage EXPLORER
    await h.db.execute(sql.raw(`update child_profile set current_stage='EXPLORER' where id='${childId}'`));
    const childToken = await openChildSession(h.app, token, childId);

    const asChild = await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(childToken) });
    const childPackIds = asChild.json().packs.map((p: { id: string; stage: string }) => p.id);
    expect(childPackIds).not.toContain('vi-g1-base-camp-starter'); // không thấy BASE_CAMP
    expect(asChild.json().packs.every((p: { stage: string }) => p.stage === 'EXPLORER')).toBe(true);

    const asParent = await h.app.inject({
      method: 'GET',
      url: '/content/packs',
      headers: bearer(token),
    });
    expect(asParent.json().packs.length).toBeGreaterThanOrEqual(2);

    const unit = await h.app.inject({
      method: 'GET',
      url: '/content/units/vi-g1-math-number-bonds-001',
      headers: bearer(childToken),
    });
    expect(unit.statusCode).toBe(404); // ngoài stage của trẻ
  });

  it('child ở BASE_CAMP thấy pack BASE_CAMP', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    const res = await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(childToken) });
    expect(res.json().packs.length).toBeGreaterThanOrEqual(2);
    expect(res.json().packs.every((p: { stage: string }) => p.stage === 'BASE_CAMP')).toBe(true);
  });

  it('child-session trả childContext (tuổi, thời lượng, stage) — không có ngày sinh', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token, { birthMonth: 6, birthYear: 2020, screenSessionMinutes: 12 });
    const res = await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/child-session`,
      headers: bearer(token),
    });
    const ctx = res.json().childContext;
    expect(ctx.screenSessionMinutes).toBe(12);
    expect(ctx.stage).toBe('BASE_CAMP');
    expect(typeof ctx.ageYears).toBe('number');
    expect(res.body).not.toContain('birthYear');
    expect(res.body).not.toContain('2020');
  });
});

describe('Hint cooldown server-side (EDU-1)', () => {
  it('bấm hint hai lần liên tiếp -> lần hai trả cooldown, không leo thang', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    const start = await h.app.inject({
      method: 'POST',
      url: '/sessions',
      headers: bearer(childToken),
      payload: { learningUnitId: 'vi-g1-math-number-bonds-001', clientGeneratedId: 'cg-cool-1' },
    });
    const sid = start.json().id;

    const h1 = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/hint`,
      headers: bearer(childToken),
      payload: { signals: { childRequestedHelp: true, secondsSincePrompt: 60 } },
    });
    expect(h1.json().cooldown).toBeUndefined();

    const h2 = await h.app.inject({
      method: 'POST',
      url: `/sessions/${sid}/hint`,
      headers: bearer(childToken),
      payload: { signals: { childRequestedHelp: true, secondsSincePrompt: 61 } },
    });
    expect(h2.json().cooldown).toBe(true);
    expect(h2.json().rulesFired).toBe(0);
    // Chỉ 1 hint_interaction được ghi (lần hai không tạo mới).
    const n = await h.db.execute(sql.raw(`select count(*)::int n from hint_interaction where session_id='${sid}'`));
    expect((n.rows[0] as { n: number }).n).toBe(1);
  });
});
