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

async function completeSession(childToken: string, cgid: string): Promise<string> {
  const start = await h.app.inject({
    method: 'POST',
    url: '/sessions',
    headers: bearer(childToken),
    payload: { learningUnitId: UNIT, clientGeneratedId: cgid },
  });
  const sid = start.json().id;
  await h.app.inject({ method: 'POST', url: `/sessions/${sid}/plan`, headers: bearer(childToken), payload: { text: 'kế hoạch' } });
  await h.app.inject({
    method: 'POST',
    url: `/sessions/${sid}/attempts`,
    headers: bearer(childToken),
    payload: { content: { text: '6 và 4' } },
  });
  await h.app.inject({
    method: 'POST',
    url: `/sessions/${sid}/reflection`,
    headers: bearer(childToken),
    payload: { prompt: 'Bước nào con tự làm được nhất?', responseType: 'IMAGE_CHOICE', responseRef: 'easy' },
  });
  await h.app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: bearer(childToken) });
  return sid;
}

describe('parent_observation (MVP bước 9)', () => {
  it('phụ huynh thêm quan sát -> 201, xuất hiện trong dashboard', async () => {
    const { token, pin } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const res = await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/observations`,
      headers: bearer(token),
      payload: { text: 'Bé tự lấy giấy bút mà không cần nhắc', tags: ['tự chủ'] },
    });
    expect(res.statusCode).toBe(201);

    await verifyPin(h.app, token, pin);
    const dash = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/dashboard`,
      headers: bearer(token),
    });
    expect(dash.json().dashboard.recentObservations[0].text).toContain('tự lấy giấy bút');
  });

  it('quan sát cho trẻ family khác -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const childA = await createChild(h.app, a.token);
    const res = await h.app.inject({
      method: 'POST',
      url: `/children/${childA}/observations`,
      headers: bearer(b.token),
      payload: { text: 'x' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('child_assent (spec §6.1/§12)', () => {
  it('ghi assent -> xuất hiện trong current + export', async () => {
    const { token } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const familyId = me.json().familyId;
    const childId = await createChild(h.app, token);

    const rec = await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/assent`,
      headers: bearer(token),
      payload: { type: 'VOICE_RECORDING', given: true, method: 'VERBAL_TO_PARENT', note: 'bé gật đầu' },
    });
    expect(rec.statusCode).toBe(201);

    const list = await h.app.inject({ method: 'GET', url: `/children/${childId}/assent`, headers: bearer(token) });
    expect(list.json().current.VOICE_RECORDING.given).toBe(true);

    const exp = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'EXPORT' },
    });
    const dl = await h.app.inject({ method: 'GET', url: exp.json().downloadPath, headers: bearer(token) });
    expect(dl.json().childAssents.length).toBe(1);
    expect(dl.json().childAssents[0].type).toBe('VOICE_RECORDING');
  });

  it('assent cho trẻ family khác -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const childA = await createChild(h.app, a.token);
    const res = await h.app.inject({
      method: 'POST',
      url: `/children/${childA}/assent`,
      headers: bearer(b.token),
      payload: { type: 'DATA_PROCESSING', given: true, method: 'OBSERVED' },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('dashboard (MVP bước 10) — không xếp hạng / dự báo', () => {
  it('tính số liệu từ phiên đã hoàn thành', async () => {
    const { token, pin } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    await completeSession(childToken, 'cg-dash-1');
    await completeSession(childToken, 'cg-dash-2');

    await verifyPin(h.app, token, pin);
    const res = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/dashboard`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const d = res.json().dashboard;
    expect(d.independence.completedSessions).toBe(2);
    expect(d.independence.independentCompletionRate).toBe(1); // 0 hint -> độc lập
    expect(d.explanation.reflectionsCompleted).toBe(2);
    expect(d.skillEvidence.count).toBeGreaterThanOrEqual(3);
    expect(typeof d.suggestedNextAction).toBe('string');
    // Cấm: không có trường xếp hạng / dự báo / IQ
    const json = JSON.stringify(res.json()).toLowerCase();
    for (const banned of ['rank', 'iq', 'percentile', 'đậu', 'rớt', 'top ']) {
      expect(json.includes(banned)).toBe(false);
    }
  });

  it('child session KHÔNG xem được dashboard -> 403', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    const res = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/dashboard`,
      headers: bearer(childToken),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('skill_evidence (MVP)', () => {
  it('tự sinh khi hoàn thành phiên; nhiều minh chứng cho mỗi kỹ năng, verifier=SYSTEM', async () => {
    const { token } = await registerParent(h.app);
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    await completeSession(childToken, 'cg-se-1');

    const res = await h.app.inject({
      method: 'GET',
      url: `/children/${childId}/skill-evidence`,
      headers: bearer(token),
    });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b.distinctSkills).toBeGreaterThanOrEqual(3); // unit có 1 PRIMARY + 2 SECONDARY
    const all = Object.values(b.bySkill).flat() as Array<{ verifier: string }>;
    expect(all.every((e) => e.verifier === 'SYSTEM')).toBe(true);
  });
});

describe('data_request EXPORT / DELETE (MVP bước 12)', () => {
  it('EXPORT -> DONE + tải được JSON (không chứa mật khẩu/hash)', async () => {
    const { token } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const familyId = me.json().familyId;
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    await completeSession(childToken, 'cg-exp-1');

    const req = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'EXPORT' },
    });
    expect(req.statusCode).toBe(201);
    expect(req.json().status).toBe('DONE');

    const dl = await h.app.inject({
      method: 'GET',
      url: req.json().downloadPath,
      headers: bearer(token),
    });
    expect(dl.statusCode).toBe(200);
    expect(dl.body).not.toContain('scrypt$');
    expect(dl.body).not.toContain('passwordHash');
    const data = dl.json();
    expect(data.children[0].id).toBe(childId);
    expect(data.sessions.length).toBe(1);
    expect(data.skillEvidence.length).toBeGreaterThanOrEqual(3);
  });

  it('EXPORT gồm dữ liệu Giai đoạn 3–5; DELETE trẻ -> các bảng đó cũng biến mất', async () => {
    const { token, pin } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const familyId = me.json().familyId;
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    await completeSession(childToken, 'cg-exp45-1');

    await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/interest-signals`,
      headers: bearer(token),
      payload: { domain: 'MATHEMATICS', strength: 'HIGH' },
    });
    const proj = await h.app.inject({
      method: 'POST',
      url: '/scholar/projects',
      headers: bearer(token),
      payload: {
        childId,
        title: 'Vườn mưa',
        drivingQuestion: 'Trồng rau bằng nước mưa thế nào cho hiệu quả?',
        disciplines: ['SCIENCE'],
        targetMonths: 4,
      },
    });
    await h.app.inject({
      method: 'POST',
      url: `/scholar/projects/${proj.json().id}/contributions`,
      headers: bearer(token),
      payload: { kind: 'FIELDWORK', summary: 'Đo lượng mưa 1 tuần.' },
    });

    const req = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'EXPORT' },
    });
    const data = (
      await h.app.inject({ method: 'GET', url: req.json().downloadPath, headers: bearer(token) })
    ).json();
    expect(Array.isArray(data.attemptErrors)).toBe(true);
    expect(data.interestSignals.length).toBeGreaterThanOrEqual(1);
    expect(data.scholarProjects.length).toBe(1);
    expect(data.projectContributions.length).toBe(1);

    await verifyPin(h.app, token, pin);
    await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'DELETE', childProfileId: childId, confirm: true },
    });
    const gone = await h.db.execute(
      sql.raw(
        `select
           (select count(*) from interest_signal where child_profile_id = '${childId}') as isig,
           (select count(*) from scholar_project where child_profile_id = '${childId}') as proj,
           (select count(*) from project_contribution where child_profile_id = '${childId}') as contrib`,
      ),
    );
    const row = gone.rows[0] as { isig: number; proj: number; contrib: number };
    expect(Number(row.isig)).toBe(0);
    expect(Number(row.proj)).toBe(0);
    expect(Number(row.contrib)).toBe(0);
  });

  it('EXPORT của family khác -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const meA = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(a.token) });
    const res = await h.app.inject({
      method: 'POST',
      url: `/families/${meA.json().familyId}/data-requests`,
      headers: bearer(b.token),
      payload: { kind: 'EXPORT' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE cần PIN + confirm; sau khi đủ -> dữ liệu trẻ biến mất', async () => {
    const { token, pin } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const familyId = me.json().familyId;
    const childId = await createChild(h.app, token);
    const childToken = await openChildSession(h.app, token, childId);
    await completeSession(childToken, 'cg-del-1');

    // Chưa xác thực PIN -> 403
    const noPin = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'DELETE', childProfileId: childId, confirm: true },
    });
    expect(noPin.statusCode).toBe(403);
    expect(noPin.json().reason).toBe('pin_verification_required');

    await verifyPin(h.app, token, pin);

    const noConfirm = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'DELETE', childProfileId: childId },
    });
    expect(noConfirm.statusCode).toBe(400);

    const del = await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'DELETE', childProfileId: childId, confirm: true },
    });
    expect(del.statusCode).toBe(200);

    const cp = await h.db.execute(sql.raw(`select count(*)::int n from child_profile where id = '${childId}'`));
    expect((cp.rows[0] as { n: number }).n).toBe(0);
    const ses = await h.db.execute(sql.raw(`select count(*)::int n from session where child_profile_id = '${childId}'`));
    expect((ses.rows[0] as { n: number }).n).toBe(0);
  });

  it('audit_log ghi mọi thao tác governance', async () => {
    const { token } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const familyId = me.json().familyId;
    const childId = await createChild(h.app, token);
    await h.app.inject({
      method: 'POST',
      url: `/children/${childId}/observations`,
      headers: bearer(token),
      payload: { text: 'ghi chú' },
    });
    await h.app.inject({
      method: 'POST',
      url: `/families/${familyId}/data-requests`,
      headers: bearer(token),
      payload: { kind: 'EXPORT' },
    });

    const log = await h.app.inject({
      method: 'GET',
      url: `/families/${familyId}/audit-log`,
      headers: bearer(token),
    });
    const actions = log.json().entries.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['family.registered', 'parent_observation.added', 'data_request.export']));
  });
});
