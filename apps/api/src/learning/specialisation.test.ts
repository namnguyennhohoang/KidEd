import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  makeHarness,
  registerParent,
  createChild,
  openChildSession,
  verifyPin,
  bearer,
  type Harness,
} from '../test-support/harness.js';
import { isoWeek } from './specialisation.js';

let h: Harness;
let parentToken: string;
let childId: string;
const PIN = '246813';
const UNIT = 'vi-g1-math-number-bonds-001'; // domains: MATHEMATICS, ART_DESIGN, COMMUNICATION

beforeAll(async () => {
  h = await makeHarness();
  const p = await registerParent(h.app, { pin: PIN });
  parentToken = p.token;
  childId = await createChild(h.app, parentToken);
});
afterAll(async () => {
  await h.close();
});

const auth = () => bearer(parentToken);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

async function addSignal(token: string, cid: string, over: Record<string, unknown>) {
  return h.app.inject({
    method: 'POST',
    url: `/children/${cid}/interest-signals`,
    headers: bearer(token),
    payload: { domain: 'MATHEMATICS', strength: 'MED', ...over },
  });
}

describe('Giai đoạn 4 — chu kỳ trải nghiệm (SPECIALISATION)', () => {
  it('GET /specialisation/domains -> 12 domain hợp lệ', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/specialisation/domains', headers: auth() });
    expect(r.statusCode).toBe(200);
    expect(r.json().domains).toContain('MATHEMATICS');
    expect(r.json().domains).toHaveLength(12);
  });

  it('tạo chu kỳ < 3 lĩnh vực -> 422 (bắt buộc "nhiều lĩnh vực")', async () => {
    const r = await h.app.inject({
      method: 'POST',
      url: '/specialisation/cycles',
      headers: auth(),
      payload: { childId, title: 'Thử', domains: ['MATHEMATICS', 'SCIENCE'], plannedWeeks: 10 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe('need_multiple_domains');
  });

  it('tạo chu kỳ plannedWeeks ngoài 8–12 -> 422', async () => {
    const r = await h.app.inject({
      method: 'POST',
      url: '/specialisation/cycles',
      headers: auth(),
      payload: { childId, title: 'Thử', domains: ['MATHEMATICS', 'SCIENCE', 'ENGLISH'], plannedWeeks: 4 },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error).toBe('planned_weeks_out_of_range');
  });

  it('tạo chu kỳ hợp lệ -> 201 ACTIVE; chu kỳ thứ hai -> 409', async () => {
    const r = await h.app.inject({
      method: 'POST',
      url: '/specialisation/cycles',
      headers: auth(),
      payload: {
        childId,
        title: 'Vòng khám phá học kỳ 1',
        domains: ['MATHEMATICS', 'ART_DESIGN', 'SCIENCE', 'MUSIC_PIANO'],
        plannedWeeks: 10,
      },
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().status).toBe('ACTIVE');

    const dup = await h.app.inject({
      method: 'POST',
      url: '/specialisation/cycles',
      headers: auth(),
      payload: { childId, title: 'Lại nữa', domains: ['ENGLISH', 'SCIENCE', 'MATHEMATICS'], plannedWeeks: 8 },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('cycle_already_active');
  });

  it('GET /specialisation/cycles cần PIN; có PIN -> thấy chu kỳ', async () => {
    const noPin = await h.app.inject({
      method: 'GET',
      url: `/specialisation/cycles?childId=${childId}`,
      headers: auth(),
    });
    expect(noPin.statusCode).toBe(403);

    await verifyPin(h.app, parentToken, PIN);
    const withPin = await h.app.inject({
      method: 'GET',
      url: `/specialisation/cycles?childId=${childId}`,
      headers: auth(),
    });
    expect(withPin.statusCode).toBe(200);
    expect(withPin.json().cycles).toHaveLength(1);
    // KHÔNG có trường "môn chuyên đã chọn" ở bất kỳ đâu.
    expect(JSON.stringify(withPin.json())).not.toMatch(/chosen|recommend|bestFit|specialisationChoice/i);
  });

  it('hoàn thành chu kỳ -> COMPLETED + ghi chú "không phải kết luận về môn chuyên"', async () => {
    const list = await h.app.inject({
      method: 'GET',
      url: `/specialisation/cycles?childId=${childId}`,
      headers: auth(),
    });
    const cycleId = list.json().cycles[0].id;
    const r = await h.app.inject({
      method: 'POST',
      url: `/specialisation/cycles/${cycleId}/complete`,
      headers: auth(),
      payload: { reflectionNote: 'Bé thích nhất phần dựng mô hình toán bằng vật liệu tái chế.' },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().status).toBe('COMPLETED');
    expect(r.json().note).toMatch(/không phải kết luận/i);

    const again = await h.app.inject({
      method: 'POST',
      url: `/specialisation/cycles/${cycleId}/complete`,
      headers: auth(),
      payload: { reflectionNote: 'x'.repeat(5) },
    });
    expect(again.statusCode).toBe(409);
  });
});

describe('interest signals + interest-profile', () => {
  it('trẻ tự ghi tín hiệu trong phiên trẻ (source CHILD_SELF); ghi hộ trẻ khác -> 404', async () => {
    const childToken = await openChildSession(h.app, parentToken, childId);
    const ok = await addSignal(childToken, childId, { domain: 'ART_DESIGN', strength: 'HIGH' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().source).toBe('CHILD_SELF');

    const otherParent = await registerParent(h.app);
    const otherChild = await createChild(h.app, otherParent.token);
    const bad = await addSignal(childToken, otherChild, { domain: 'ART_DESIGN', strength: 'LOW' });
    expect(bad.statusCode).toBe(404);
  });

  it('domain lạ / strength lạ -> 422', async () => {
    const d = await addSignal(parentToken, childId, { domain: 'ROCKET_SCIENCE', strength: 'MED' });
    expect(d.statusCode).toBe(422);
    const s = await addSignal(parentToken, childId, { domain: 'MATHEMATICS', strength: 'SUPER' });
    expect(s.statusCode).toBe(422);
  });

  it('nhiều tín hiệu rải theo thời gian -> sustained=true; domain một tín hiệu -> SPARSE', async () => {
    // MATHEMATICS: 4 tín hiệu rải trên ~5 tuần, không có khoảng lặng lớn, sức mạnh tăng dần.
    for (const [d, st] of [
      [35, 'LOW'],
      [24, 'MED'],
      [12, 'MED'],
      [2, 'HIGH'],
    ] as const) {
      const r = await addSignal(parentToken, childId, {
        domain: 'MATHEMATICS',
        strength: st,
        observedAt: daysAgo(d),
      });
      expect(r.statusCode).toBe(201);
    }
    // SOCIAL_STUDIES: chỉ 1 tín hiệu.
    await addSignal(parentToken, childId, { domain: 'SOCIAL_STUDIES', strength: 'MED', observedAt: daysAgo(3) });

    await verifyPin(h.app, parentToken, PIN);
    const prof = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/interest-profile`,
      headers: auth(),
    });
    expect(prof.statusCode).toBe(200);
    const body = prof.json();
    const math = body.byDomain.find((x: { domain: string }) => x.domain === 'MATHEMATICS');
    expect(math.sustained).toBe(true);
    expect(math.distinctWeeks).toBeGreaterThanOrEqual(3);
    expect(['RISING', 'STEADY']).toContain(math.trend);

    const soc = body.byDomain.find((x: { domain: string }) => x.domain === 'SOCIAL_STUDIES');
    expect(soc.sustained).toBe(false);
    expect(soc.trend).toBe('SPARSE');
  });

  it('hoàn thành phiên -> tự sinh interest_signal SESSION_ENGAGEMENT cho mọi domain của nhiệm vụ (idempotent)', async () => {
    const c2 = await createChild(h.app, parentToken);
    const t2 = await openChildSession(h.app, parentToken, c2);
    const body = {
      session: { clientGeneratedId: 'cg-auto-isg-1', learningUnitId: UNIT, startedAt: daysAgo(1) },
      completed: true,
    };
    expect((await h.app.inject({ method: 'POST', url: '/sessions/sync', headers: bearer(t2), payload: body })).statusCode).toBe(201);
    // Gọi lại (idempotent theo clientGeneratedId + theo session_id ở tầng interest).
    await h.app.inject({ method: 'POST', url: '/sessions/sync', headers: bearer(t2), payload: body });

    await verifyPin(h.app, parentToken, PIN);
    const prof = (
      await h.app.inject({ method: 'GET', url: `/children/${c2}/interest-profile`, headers: auth() })
    ).json();
    const domains = prof.byDomain.map((d: { domain: string }) => d.domain).sort();
    expect(domains).toEqual(['ART_DESIGN', 'COMMUNICATION', 'MATHEMATICS']); // domains của UNIT
    for (const d of prof.byDomain) {
      expect(d.sources).toEqual(['SESSION_ENGAGEMENT']);
      expect(d.signalCount).toBe(1); // không nhân đôi
    }
  });

  it('crossover: nhiệm vụ trẻ đã làm nối 2 domain đang có tín hiệu -> crossoverHints', async () => {
    // Trẻ hoàn thành 1 phiên trên unit domains [MATHEMATICS, ART_DESIGN, COMMUNICATION] qua sync.
    const childToken = await openChildSession(h.app, parentToken, childId);
    const sync = await h.app.inject({
      method: 'POST',
      url: '/sessions/sync',
      headers: bearer(childToken),
      payload: {
        session: { clientGeneratedId: `cg-spec-${Date.now()}`, learningUnitId: UNIT, startedAt: daysAgo(1) },
        completed: true,
      },
    });
    expect(sync.statusCode).toBe(201);

    await verifyPin(h.app, parentToken, PIN);
    const prof = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/interest-profile`,
      headers: auth(),
    });
    const pairs = prof
      .json()
      .crossoverHints.map((c: { domains: [string, string] }) => c.domains.join('+'));
    // MATHEMATICS + ART_DESIGN đều có tín hiệu và cùng xuất hiện trong unit.
    expect(pairs).toContain('ART_DESIGN+MATHEMATICS');
  });

  it('interest-profile KHÔNG đề xuất môn chuyên / KHÔNG xếp hạng (chống "một bài test")', async () => {
    await verifyPin(h.app, parentToken, PIN);
    const prof = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/interest-profile`,
      headers: auth(),
    });
    const raw = JSON.stringify(prof.json());
    for (const banned of [
      'recommendedSpecialisation',
      'chosenTrack',
      'bestFitSubject',
      'bestFit',
      'rank',
      'percentile',
      'aptitude',
      'pass_probability',
      '"score"',
    ]) {
      expect(raw).not.toContain(banned);
    }
    expect(prof.json().disclaimer).toMatch(/không chốt/i);
    expect(prof.json().disclaimer).toMatch(/không phải gợi ý/i);
  });

  it('interest-profile của trẻ family khác -> 404', async () => {
    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    await verifyPin(h.app, parentToken, PIN);
    const r = await h.app.inject({
      method: 'GET',
      url: `/children/${otherChild}/interest-profile`,
      headers: auth(),
    });
    expect(r.statusCode).toBe(404);
  });
});

describe('isoWeek', () => {
  it('cùng tuần -> cùng nhãn; khác tuần -> khác nhãn', () => {
    expect(isoWeek(new Date('2026-09-07T00:00:00Z'))).toBe(isoWeek(new Date('2026-09-09T23:00:00Z')));
    expect(isoWeek(new Date('2026-09-07T00:00:00Z'))).not.toBe(isoWeek(new Date('2026-09-20T00:00:00Z')));
  });
});

describe('SPEC_HS_READINESS — chốt môn chuyên (chính + dự phòng), version hóa', () => {
  const post = (url: string, payload: Record<string, unknown>) =>
    h.app.inject({ method: 'POST', url, headers: auth(), payload });

  it('chốt khi trẻ CHƯA hoàn thành chu kỳ nào -> 409 need_completed_cycle', async () => {
    const fresh = await createChild(h.app, parentToken);
    const r = await post('/specialisation/choices', {
      childId: fresh,
      primarySubject: 'MATHEMATICS',
      backupSubject: 'SCIENCE',
      rationale: 'Bé mạnh logic.',
    });
    expect(r.statusCode).toBe(409);
    expect(r.json().error).toBe('need_completed_cycle');
  });

  it('primary trùng backup -> 422; môn lạ -> 422', async () => {
    // childId đã có 1 chu kỳ COMPLETED từ describe đầu.
    const same = await post('/specialisation/choices', {
      childId,
      primarySubject: 'MATHEMATICS',
      backupSubject: 'MATHEMATICS',
      rationale: 'x',
    });
    expect(same.statusCode).toBe(422);
    expect(same.json().error).toBe('primary_equals_backup');

    const bad = await post('/specialisation/choices', {
      childId,
      primarySubject: 'QUIDDITCH',
      backupSubject: 'SCIENCE',
      rationale: 'x',
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error).toBe('unknown_subject');
  });

  it('chốt hợp lệ -> 201 ACTIVE; chốt lần hai khi đang ACTIVE -> 409 choice_exists', async () => {
    const r = await post('/specialisation/choices', {
      childId,
      primarySubject: 'MATHEMATICS',
      backupSubject: 'SCIENCE',
      rationale: 'Bé bền hứng thú với toán qua cả chu kỳ; khoa học là dự phòng gần.',
    });
    expect(r.statusCode).toBe(201);
    expect(r.json().status).toBe('ACTIVE');

    const dup = await post('/specialisation/choices', {
      childId,
      primarySubject: 'ENGLISH',
      backupSubject: 'SCIENCE',
      rationale: 'đổi ý',
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error).toBe('choice_exists');
  });

  it('GET specialisation-choice (PIN): current + depthPlan lọc đúng môn + KHÔNG dự báo đậu/rớt', async () => {
    await verifyPin(h.app, parentToken, PIN);
    const r = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/specialisation-choice`,
      headers: auth(),
    });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.current.primarySubject).toBe('MATHEMATICS');
    expect(b.current.backupSubject).toBe('SCIENCE');

    const ids: string[] = b.depthPlan.items.map((i: { skillId: string }) => i.skillId);
    expect(b.depthPlan.overlay).toBe('TDN_SPECIALIZED_GRADE_10');
    expect(ids).toContain('MATH_LOGIC_PATTERN');
    expect(ids).toContain('SCIENCE_EXPERIMENT_DESIGN');
    expect(ids).toContain('ARGUMENT_CONSTRUCTION'); // kỹ năng lập luận — liên quan mọi môn
    expect(ids).not.toContain('ENGLISH_ACADEMIC_ESSAY'); // không thuộc môn đã chọn
    expect(b.depthPlan.items.every((i: { band: string }) => typeof i.band === 'string')).toBe(true);

    const raw = JSON.stringify(b);
    for (const banned of [
      'admitProbability',
      'pass_probability',
      'passProbability',
      'admitChance',
      'willPass',
      'guaranteed',
      'rank',
      'percentile',
      '"score"',
    ]) {
      expect(raw).not.toContain(banned);
    }
    expect(b.disclaimer).toMatch(/không dự báo/i);
  });

  it('PUT đổi lựa chọn -> supersede, giữ lịch sử', async () => {
    const cur = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/specialisation-choice`,
      headers: auth(),
    });
    const oldId = cur.json().current.id;
    const put = await h.app.inject({
      method: 'PUT',
      url: `/specialisation/choices/${oldId}`,
      headers: auth(),
      payload: { primarySubject: 'ENGLISH', backupSubject: 'VIETNAMESE_LITERACY', rationale: 'Bé chuyển hướng ngôn ngữ.' },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json().supersededId).toBe(oldId);

    await verifyPin(h.app, parentToken, PIN);
    const after = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/specialisation-choice`,
      headers: auth(),
    });
    const body = after.json();
    expect(body.current.primarySubject).toBe('ENGLISH');
    expect(body.history.length).toBe(2);
    expect(body.history.find((x: { id: string }) => x.id === oldId).status).toBe('SUPERSEDED');
    // PUT lên bản đã supersede -> 409
    const stale = await h.app.inject({
      method: 'PUT',
      url: `/specialisation/choices/${oldId}`,
      headers: auth(),
      payload: { primarySubject: 'SCIENCE', backupSubject: 'MATHEMATICS', rationale: 'x' },
    });
    expect(stale.statusCode).toBe(409);
  });

  it('withdraw -> current null, depthPlan null', async () => {
    const cur = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/specialisation-choice`,
      headers: auth(),
    });
    const id = cur.json().current.id;
    const w = await post(`/specialisation/choices/${id}/withdraw`, {});
    expect(w.statusCode).toBe(200);
    expect(w.json().status).toBe('WITHDRAWN');

    await verifyPin(h.app, parentToken, PIN);
    const after = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/specialisation-choice`,
      headers: auth(),
    });
    expect(after.json().current).toBeNull();
    expect(after.json().depthPlan).toBeNull();
    expect(after.json().history.length).toBe(2);
  });

  it('specialisation-choice của trẻ family khác -> 404', async () => {
    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    await verifyPin(h.app, parentToken, PIN);
    const r = await h.app.inject({
      method: 'GET',
      url: `/children/${otherChild}/specialisation-choice`,
      headers: auth(),
    });
    expect(r.statusCode).toBe(404);
  });
});
