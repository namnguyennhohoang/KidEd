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

let h: Harness;
let parentToken: string;
const PIN = '246813';

beforeAll(async () => {
  h = await makeHarness();
  parentToken = (await registerParent(h.app, { pin: PIN })).token;
});
afterAll(async () => {
  await h.close();
});

const auth = () => bearer(parentToken);
const mkChild = () => createChild(h.app, parentToken);

async function mkProject(token: string, childId: string, over: Record<string, unknown> = {}) {
  return h.app.inject({
    method: 'POST',
    url: '/scholar/projects',
    headers: bearer(token),
    payload: {
      childId,
      title: 'Nước sạch cho xóm',
      drivingQuestion: 'Làm sao lọc nước mưa an toàn với chi phí thấp cho 10 hộ?',
      disciplines: ['SCIENCE', 'SOCIAL_STUDIES'],
      targetMonths: 6,
      ...over,
    },
  });
}
const contrib = (token: string, pid: string, payload: Record<string, unknown>) =>
  h.app.inject({ method: 'POST', url: `/scholar/projects/${pid}/contributions`, headers: bearer(token), payload });

describe('Giai đoạn 5 — Global Scholar: dự án dài hạn', () => {
  it('GET /scholar/meta -> pathways + 4 mức AI + độ dài ghi chú tối thiểu', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/scholar/meta', headers: auth() });
    expect(r.statusCode).toBe(200);
    expect(r.json().pathways).toEqual(expect.arrayContaining(['US', 'UK', 'SG', 'CA', 'AU', 'UNDECIDED']));
    expect(r.json().aiAssistanceLevels).toHaveLength(4);
    expect(r.json().aiNoteMinLength).toBe(12);
  });

  it('targetMonths ngoài 3–24 -> 422; pathway lạ -> 422', async () => {
    const c = await mkChild();
    const short = await mkProject(parentToken, c, { targetMonths: 2 });
    expect(short.statusCode).toBe(422);
    expect(short.json().error).toBe('target_months_out_of_range');
    const bad = await mkProject(parentToken, c, { pathway: 'MARS' });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error).toBe('unknown_pathway');
  });

  it('tạo dự án hợp lệ -> 201 ACTIVE; quá 2 dự án ACTIVE -> 409', async () => {
    const c = await mkChild();
    const p1 = await mkProject(parentToken, c, { pathway: 'US' });
    expect(p1.statusCode).toBe(201);
    expect(p1.json()).toMatchObject({ status: 'ACTIVE', pathway: 'US' });
    expect((await mkProject(parentToken, c, { title: 'Dự án 2' })).statusCode).toBe(201);
    const p3 = await mkProject(parentToken, c, { title: 'Dự án 3' });
    expect(p3.statusCode).toBe(409);
    expect(p3.json().error).toBe('too_many_active_projects');
  });

  it('đóng góp: mức NONE ok; có AI mà thiếu/ngắn ghi chú -> 422; đủ ghi chú -> 201', async () => {
    const c = await mkChild();
    const pid = (await mkProject(parentToken, c)).json().id;

    expect((await contrib(parentToken, pid, { kind: 'FIELDWORK', summary: 'Đi lấy mẫu nước 5 hộ.' })).statusCode).toBe(201);

    const noNote = await contrib(parentToken, pid, {
      kind: 'WRITE',
      summary: 'Viết báo cáo giữa kỳ.',
      aiAssistanceLevel: 'AI_GENERATED_DRAFT',
    });
    expect(noNote.statusCode).toBe(422);
    expect(noNote.json().error).toBe('ai_note_required');

    const shortNote = await contrib(parentToken, pid, {
      kind: 'WRITE',
      summary: 'Viết báo cáo.',
      aiAssistanceLevel: 'CO_CREATED_TOOL',
      aiAssistanceNote: 'ngắn',
    });
    expect(shortNote.statusCode).toBe(422);

    const ok = await contrib(parentToken, pid, {
      kind: 'WRITE',
      summary: 'Viết báo cáo.',
      aiAssistanceLevel: 'CO_CREATED_TOOL',
      aiAssistanceNote: 'AI giúp lập dàn ý và sửa ngữ pháp; nội dung số liệu và kết luận do con viết.',
      hoursSpent: 4,
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().aiAssistanceLevel).toBe('CO_CREATED_TOOL');

    expect(
      (await contrib(parentToken, pid, { kind: 'DANCING', summary: 'x' })).statusCode,
    ).toBe(422);
  });

  it('trẻ tự tạo dự án + đóng góp trong phiên trẻ; làm hộ trẻ khác -> 404', async () => {
    const c = await mkChild();
    const other = await mkChild();
    const childToken = await openChildSession(h.app, parentToken, c);

    const mine = await mkProject(childToken, c, { title: 'Vườn trường' });
    expect(mine.statusCode).toBe(201);
    const cc = await contrib(childToken, mine.json().id, { kind: 'BUILD', summary: 'Dựng khung luống rau.' });
    expect(cc.statusCode).toBe(201);

    const hijack = await mkProject(childToken, other, { title: 'Không được' });
    expect(hijack.statusCode).toBe(404);
  });

  it('GET /scholar/projects cần PIN; có PIN -> kèm contributions', async () => {
    const c = await mkChild();
    const pid = (await mkProject(parentToken, c)).json().id;
    await contrib(parentToken, pid, { kind: 'RESEARCH', summary: 'Đọc 3 bài về lọc nước.' });

    const noPin = await h.app.inject({ method: 'GET', url: `/scholar/projects?childId=${c}`, headers: auth() });
    expect(noPin.statusCode).toBe(403);

    await verifyPin(h.app, parentToken, PIN);
    const withPin = await h.app.inject({ method: 'GET', url: `/scholar/projects?childId=${c}`, headers: auth() });
    expect(withPin.statusCode).toBe(200);
    expect(withPin.json().projects[0].contributions).toHaveLength(1);
  });

  it('hoàn thành dự án -> COMPLETED; đóng góp vào dự án đã đóng -> 409', async () => {
    const c = await mkChild();
    const pid = (await mkProject(parentToken, c)).json().id;
    const done = await h.app.inject({
      method: 'POST',
      url: `/scholar/projects/${pid}/complete`,
      headers: auth(),
      payload: { reflectionNote: 'Bộ lọc chạy ổn cho 6 hộ; còn nghẽn khi mưa lớn — vòng sau cải tiến.' },
    });
    expect(done.statusCode).toBe(200);
    expect(done.json().status).toBe('COMPLETED');

    const late = await contrib(parentToken, pid, { kind: 'REVISION', summary: 'thêm' });
    expect(late.statusCode).toBe(409);
    expect(late.json().error).toBe('project_not_active');
  });
});

describe('scholar-portfolio — hồ sơ chữ T + bản kê khai AI', () => {
  it('tổng hợp trung thực breakdown AI + tShape; KHÔNG dự báo trúng tuyển', async () => {
    const c = await mkChild();
    const pid = (await mkProject(parentToken, c, { disciplines: ['SCIENCE', 'ENGLISH', 'SOCIAL_STUDIES'] })).json().id;
    await contrib(parentToken, pid, { kind: 'FIELDWORK', summary: 'Lấy mẫu.' });
    await contrib(parentToken, pid, { kind: 'RESEARCH', summary: 'Đọc tài liệu.', aiAssistanceLevel: 'HINTS_ONLY' });
    await contrib(parentToken, pid, {
      kind: 'WRITE',
      summary: 'Bản nháp luận.',
      aiAssistanceLevel: 'AI_GENERATED_DRAFT',
      aiAssistanceNote: 'AI viết bản nháp đầu tiên theo dàn ý của con; con viết lại toàn bộ bằng lời mình.',
    });

    await verifyPin(h.app, parentToken, PIN);
    const r = await h.app.inject({
      method: 'GET',
      url: `/children/${c}/scholar-portfolio`,
      headers: auth(),
    });
    expect(r.statusCode).toBe(200);
    const b = r.json();
    expect(b.aiAssistanceBreakdown.NONE).toBe(1);
    expect(b.aiAssistanceBreakdown.HINTS_ONLY).toBe(1);
    expect(b.aiAssistanceBreakdown.AI_GENERATED_DRAFT).toBe(1);
    expect(b.humanLedShare).toBeCloseTo(2 / 3, 5);
    expect(b.projects[0].provenanceGaps).toBe(0);
    expect(b.tShape.breadthDisciplines).toEqual(expect.arrayContaining(['SCIENCE', 'ENGLISH', 'SOCIAL_STUDIES']));
    expect(b.tShape.depthSubject).toBeNull();
    expect(b.tShape.hasSpike).toBe(false);

    const raw = JSON.stringify(b);
    for (const banned of [
      'admitChance',
      'admissionProbability',
      'admitProbability',
      'competitiveness',
      'willAdmit',
      'rank',
      'percentile',
      'strengthScore',
      '"score"',
    ]) {
      expect(raw).not.toContain(banned);
    }
    expect(b.disclaimer).toMatch(/không phải dự báo trúng tuyển/i);
  });

  it('pathwayReferences: quy chế đã theo dõi gom theo lộ trình quốc gia của dự án', async () => {
    const c = await mkChild();
    await mkProject(parentToken, c, { pathway: 'US', title: 'Dự án lộ trình Mỹ' });

    // Quy chế GLOBAL_TOP_UNIVERSITY / US: tạo + verify.
    await verifyPin(h.app, parentToken, PIN);
    const rule = await h.app.inject({
      method: 'POST',
      url: '/admissions/rules',
      headers: auth(),
      payload: {
        targetOverlayCode: 'GLOBAL_TOP_UNIVERSITY',
        pathwayCode: 'US',
        institutionCode: 'MIT',
        institutionName: 'MIT',
        admissionYear: 2032,
        sourceUrl: 'https://mitadmissions.org/',
        sourceCheckedDate: new Date().toISOString(),
      },
    });
    await h.app.inject({ method: 'POST', url: `/admissions/rules/${rule.json().id}/verify`, headers: auth() });

    const prof = (
      await h.app.inject({ method: 'GET', url: `/children/${c}/scholar-portfolio`, headers: auth() })
    ).json();
    const us = prof.pathwayReferences.find((p: { pathway: string }) => p.pathway === 'US');
    expect(us).toBeTruthy();
    expect(us.verified).toBe(1);
    expect(us.institutions).toContain('MIT');
  });

  it('scholar-portfolio của trẻ family khác -> 404', async () => {
    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    await verifyPin(h.app, parentToken, PIN);
    const r = await h.app.inject({
      method: 'GET',
      url: `/children/${otherChild}/scholar-portfolio`,
      headers: auth(),
    });
    expect(r.statusCode).toBe(404);
  });
});
