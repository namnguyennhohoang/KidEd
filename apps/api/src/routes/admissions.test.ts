import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, registerParent, verifyPin, bearer, type Harness } from '../test-support/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.close();
});

function ruleInput(over: Record<string, unknown> = {}) {
  return {
    targetOverlayCode: 'TDN_GRADE_6',
    institutionCode: 'TDN',
    institutionName: 'THCS-THPT Trần Đại Nghĩa',
    admissionYear: 2027,
    eligibility: { residency: 'TP.HCM', gpa: 'hoàn thành tiểu học' },
    examOrPortfolioStructure: { format: 'bài khảo sát năng lực', sections: ['tiếng Việt', 'toán', 'tiếng Anh'] },
    subjects: ['tiếng Việt', 'toán', 'tiếng Anh'],
    scoringMethod: { scale: 100, note: 'chưa công bố cách quy đổi' },
    ...over,
  };
}

async function createRule(token: string, over: Record<string, unknown> = {}) {
  const res = await h.app.inject({
    method: 'POST',
    url: '/admissions/rules',
    headers: bearer(token),
    payload: ruleInput(over),
  });
  return res.json().id as string;
}

describe('Admissions Rule Tracker', () => {
  it('có 3 TargetOverlay', async () => {
    const { token } = await registerParent(h.app);
    const res = await h.app.inject({ method: 'GET', url: '/admissions/overlays', headers: bearer(token) });
    expect(res.json().overlays.map((o: { code: string }) => o.code).sort()).toEqual([
      'GLOBAL_TOP_UNIVERSITY',
      'TDN_GRADE_6',
      'TDN_SPECIALIZED_GRADE_10',
    ]);
  });

  it('tạo DRAFT; verify thiếu nguồn -> 422; có nguồn + PIN -> VERIFIED', async () => {
    const { token, pin } = await registerParent(h.app);
    const id = await createRule(token);

    const noSrc = await h.app.inject({ method: 'POST', url: `/admissions/rules/${id}/verify`, headers: bearer(token) });
    // chưa PIN -> 403 trước cả 422
    expect(noSrc.statusCode).toBe(403);

    await verifyPin(h.app, token, pin);
    const stillNoSrc = await h.app.inject({ method: 'POST', url: `/admissions/rules/${id}/verify`, headers: bearer(token) });
    expect(stillNoSrc.statusCode).toBe(422);

    await h.app.inject({
      method: 'PUT',
      url: `/admissions/rules/${id}`,
      headers: bearer(token),
      payload: {
        sourceUrl: 'https://thcsthpttrandainghia.edu.vn/tuyen-sinh-lop-6',
        sourceCheckedDate: new Date().toISOString(),
        reviewByDate: new Date(Date.now() + 200 * 86400000).toISOString(),
      },
    });
    const ok = await h.app.inject({ method: 'POST', url: `/admissions/rules/${id}/verify`, headers: bearer(token) });
    expect(ok.json().status).toBe('VERIFIED');
  });

  it('verify quy chế năm mới -> supersede quy chế VERIFIED năm cũ cùng cơ sở', async () => {
    const { token, pin } = await registerParent(h.app);
    await verifyPin(h.app, token, pin);

    const src = {
      sourceUrl: 'https://ts10.hcm.edu.vn/',
      sourceCheckedDate: new Date().toISOString(),
    };
    const old = await createRule(token, { institutionCode: 'SUP', admissionYear: 2026, ...src });
    await h.app.inject({ method: 'POST', url: `/admissions/rules/${old}/verify`, headers: bearer(token) });

    const neo = await createRule(token, { institutionCode: 'SUP', admissionYear: 2027, ...src });
    await h.app.inject({ method: 'POST', url: `/admissions/rules/${neo}/verify`, headers: bearer(token) });

    const oldRule = await h.app.inject({ method: 'GET', url: `/admissions/rules/${old}`, headers: bearer(token) });
    expect(oldRule.json().rule.status).toBe('SUPERSEDED');
    expect(oldRule.json().rule.supersededById).toBe(neo);
  });

  it('diff field-level giữa hai năm', async () => {
    const { token } = await registerParent(h.app);
    const a = await createRule(token, { institutionCode: 'DIFF', admissionYear: 2026, subjects: ['toán'] });
    const b = await createRule(token, {
      institutionCode: 'DIFF',
      admissionYear: 2027,
      subjects: ['toán', 'tiếng Anh'],
      notes: 'thêm phần tiếng Anh',
    });
    const res = await h.app.inject({
      method: 'GET',
      url: `/admissions/rules/${b}/diff/${a}`,
      headers: bearer(token),
    });
    const changed = res.json().changes.map((c: { field: string }) => c.field);
    expect(changed).toEqual(expect.arrayContaining(['admissionYear', 'subjects', 'notes']));
  });

  it('staleness: quá năm hoặc quá hạn rà soát -> stale=true', async () => {
    const { token } = await registerParent(h.app);
    const id = await createRule(token, {
      institutionCode: 'OLD',
      admissionYear: 2019,
      reviewByDate: new Date(Date.now() - 86400000).toISOString(),
    });
    const res = await h.app.inject({ method: 'GET', url: `/admissions/rules/${id}`, headers: bearer(token) });
    expect(res.json().staleness.stale).toBe(true);
    expect(res.json().staleness.reasons.length).toBeGreaterThanOrEqual(2);

    const exp = await h.app.inject({ method: 'GET', url: '/admissions/expiring?withinDays=30', headers: bearer(token) });
    expect(exp.json().items.some((x: { rule: { id: string } }) => x.rule.id === id)).toBe(true);
  });

  it('sửa quy chế đã VERIFIED -> 409', async () => {
    const { token, pin } = await registerParent(h.app);
    await verifyPin(h.app, token, pin);
    const id = await createRule(token, {
      institutionCode: 'LOCK',
      sourceUrl: 'https://x.test/',
      sourceCheckedDate: new Date().toISOString(),
    });
    await h.app.inject({ method: 'POST', url: `/admissions/rules/${id}/verify`, headers: bearer(token) });
    const res = await h.app.inject({
      method: 'PUT',
      url: `/admissions/rules/${id}`,
      headers: bearer(token),
      payload: { notes: 'đổi' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('family khác không thấy / không sửa được quy chế của mình', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const id = await createRule(a.token, { institutionCode: 'PRIV' });
    expect(
      (await h.app.inject({ method: 'GET', url: `/admissions/rules/${id}`, headers: bearer(b.token) })).statusCode,
    ).toBe(404);
    expect(
      (
        await h.app.inject({
          method: 'PUT',
          url: `/admissions/rules/${id}`,
          headers: bearer(b.token),
          payload: { notes: 'x' },
        })
      ).statusCode,
    ).toBe(404);
  });

  it('list lọc theo năm/cơ sở/overlay', async () => {
    const { token } = await registerParent(h.app);
    await createRule(token, { institutionCode: 'LIST', admissionYear: 2028 });
    const res = await h.app.inject({
      method: 'GET',
      url: '/admissions/rules?institutionCode=LIST&year=2028',
      headers: bearer(token),
    });
    expect(res.json().rules.length).toBe(1);
    expect(res.json().rules[0].staleness).toBeTruthy();
  });

  it('pathwayCode chỉ hợp lệ với overlay GLOBAL_TOP_UNIVERSITY', async () => {
    const { token } = await registerParent(h.app);
    const bad = await h.app.inject({
      method: 'POST',
      url: '/admissions/rules',
      headers: bearer(token),
      payload: ruleInput({ targetOverlayCode: 'TDN_GRADE_6', pathwayCode: 'US', institutionCode: 'X' }),
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error).toBe('pathway_needs_global_overlay');

    const ok = await h.app.inject({
      method: 'POST',
      url: '/admissions/rules',
      headers: bearer(token),
      payload: ruleInput({
        targetOverlayCode: 'GLOBAL_TOP_UNIVERSITY',
        pathwayCode: 'US',
        institutionCode: 'MIT',
        institutionName: 'MIT',
        admissionYear: 2030,
      }),
    });
    expect(ok.statusCode).toBe(201);

    const list = await h.app.inject({
      method: 'GET',
      url: '/admissions/rules?overlay=GLOBAL_TOP_UNIVERSITY&pathway=US',
      headers: bearer(token),
    });
    expect(list.json().rules.map((r: { institutionCode: string }) => r.institutionCode)).toContain('MIT');
  });
});
