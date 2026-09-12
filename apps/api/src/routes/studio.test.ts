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

function validPack(over: Record<string, unknown> = {}) {
  return {
    kind: 'CONTENT_PACK' as const,
    schema_version: '1.0.0',
    content_version: '1.0.0',
    title: 'Gói của ba mẹ — đếm ngón tay',
    locale: 'vi-VN',
    stage: 'BASE_CAMP',
    grades: [1],
    provenance: { author: 'Ba của Bi', license: 'ORIGINAL_OR_LICENSED' },
    units: [
      {
        id: 'ba-me-dem-ngon-tay-001',
        schema_version: '1.0.0',
        content_version: '1.0.0',
        status: 'DRAFT',
        title: 'Đếm ngón tay',
        locale: 'vi-VN',
        stage: 'BASE_CAMP',
        grades: [1],
        domains: ['MATHEMATICS', 'COMMUNICATION'],
        learning_outcomes: [{ framework: 'VN_GDPT', description: 'Đếm trong phạm vi 10' }],
        skills: [
          { skill_id: 'MATH_NUMBER_SENSE', role: 'PRIMARY' },
          { skill_id: 'ORAL_EXPLANATION', role: 'SECONDARY' },
        ],
        duration_minutes: { screen: 4, offline: 12 },
        materials: ['hai bàn tay'],
        choices: [
          { id: 'LEFT', label: 'Con đếm tay trái trước' },
          { id: 'RIGHT', label: 'Con đếm tay phải trước' },
        ],
        quest_flow: {
          hook: 'Mỗi bàn tay có mấy ngón nhỉ?',
          predict_prompt: 'Con đoán hai tay cộng lại là bao nhiêu?',
          plan_prompt: 'Con định đếm thế nào?',
          attempt_requirement: { minimum_attempts_before_solution: 1 },
          explain_prompt: 'Làm sao con biết là đủ?',
          revision_prompt: 'Con thử đếm lại cách khác nhé?',
          reflection_prompt: 'Cách đếm nào con thấy dễ hơn?',
        },
        hints: [
          { level: 1, type: 'REPHRASE', content: 'Mình đang đếm tất cả các ngón tay.' },
          { level: 2, type: 'QUESTION', content: 'Con đã đếm hết bàn tay này chưa?' },
        ],
        evidence: ['VOICE_EXPLANATION', 'PARENT_OBSERVATION', 'CHILD_REFLECTION'],
        adaptations: {},
        safety: { adult_required: false, risk_level: 'LOW' },
        provenance: { author: 'Ba của Bi', license: 'ORIGINAL_OR_LICENSED' },
      },
    ],
    ...over,
  };
}

async function count(q: string) {
  const r = await h.db.execute(sql.raw(q));
  return (r.rows[0] as { n: number }).n;
}

describe('Content Studio — vòng đời DRAFT → IN_REVIEW → PUBLISHED', () => {
  it('tạo pack hợp lệ -> 201 DRAFT', async () => {
    const { token } = await registerParent(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/studio/packs',
      headers: bearer(token),
      payload: { pack: validPack() },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toMatch(/^spk_/);
  });

  it('pack không hợp lệ -> 422 + findings, KHÔNG tạo', async () => {
    const { token } = await registerParent(h.app);
    const before = await count(`select count(*)::int n from content_pack where origin='STUDIO'`);
    const bad = validPack();
    // phá S2: bỏ minimum_attempts
    (bad.units[0]!.quest_flow as Record<string, unknown>).attempt_requirement = { minimum_attempts_before_solution: 0 };
    const res = await h.app.inject({
      method: 'POST',
      url: '/studio/packs',
      headers: bearer(token),
      payload: { pack: bad },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().findings.some((f: { rule_id: string }) => f.rule_id === 'S2')).toBe(true);
    expect(await count(`select count(*)::int n from content_pack where origin='STUDIO'`)).toBe(before);
  });

  it('skill_id không có trong Skill Graph -> 422 unknown_skill, KHÔNG tạo', async () => {
    const { token } = await registerParent(h.app);
    const before = await count(`select count(*)::int n from content_pack where origin='STUDIO'`);
    const bad = validPack();
    (bad.units[0]!.skills as Array<{ skill_id: string; role: string }>).push({
      skill_id: 'NOT_A_REAL_SKILL_CODE',
      role: 'SECONDARY',
    });
    const res = await h.app.inject({
      method: 'POST',
      url: '/studio/packs',
      headers: bearer(token),
      payload: { pack: bad },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('unknown_skill');
    expect(res.json().unknownSkills).toContain('NOT_A_REAL_SKILL_CODE');
    expect(await count(`select count(*)::int n from content_pack where origin='STUDIO'`)).toBe(before);
  });

  it('submit -> approve cần PIN; sau khi đủ -> PUBLISHED + content_review (self_review)', async () => {
    const { token, pin } = await registerParent(h.app);
    const create = await h.app.inject({
      method: 'POST',
      url: '/studio/packs',
      headers: bearer(token),
      payload: { pack: validPack() },
    });
    const id = create.json().id;

    const submit = await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/submit`, headers: bearer(token) });
    expect(submit.json().status).toBe('IN_REVIEW');

    const noPin = await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/approve`, headers: bearer(token) });
    expect(noPin.statusCode).toBe(403);
    expect(noPin.json().reason).toBe('pin_verification_required');

    await verifyPin(h.app, token, pin);
    const approve = await h.app.inject({
      method: 'POST',
      url: `/studio/packs/${id}/approve`,
      headers: bearer(token),
      payload: { note: 'ổn' },
    });
    expect(approve.json().status).toBe('PUBLISHED');
    expect(approve.json().selfReview).toBe(true);
    expect(await count(`select count(*)::int n from content_review where pack_id='${id}' and decision='APPROVE'`)).toBe(1);
  });

  it('pack PUBLISHED: child cùng family thấy, family khác KHÔNG', async () => {
    const author = await registerParent(h.app);
    await verifyPin(h.app, author.token, author.pin);
    const id = (
      await h.app.inject({ method: 'POST', url: '/studio/packs', headers: bearer(author.token), payload: { pack: validPack() } })
    ).json().id;
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/submit`, headers: bearer(author.token) });
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/approve`, headers: bearer(author.token) });

    const childId = await createChild(h.app, author.token);
    const childTok = await openChildSession(h.app, author.token, childId);
    const mine = await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(childTok) });
    expect(mine.json().packs.some((p: { id: string }) => p.id === id)).toBe(true);

    const other = await registerParent(h.app);
    const otherChild = await createChild(h.app, other.token);
    const otherTok = await openChildSession(h.app, other.token, otherChild);
    const theirs = await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(otherTok) });
    expect(theirs.json().packs.some((p: { id: string }) => p.id === id)).toBe(false);
  });

  it('AI-generated: vẫn phải qua DRAFT → submit → approve; audit ghi aiGenerated', async () => {
    const { token, pin } = await registerParent(h.app);
    const me = await h.app.inject({ method: 'GET', url: '/auth/me', headers: bearer(token) });
    const create = await h.app.inject({
      method: 'POST',
      url: '/studio/packs',
      headers: bearer(token),
      payload: { pack: validPack(), aiGenerated: true },
    });
    const id = create.json().id;
    expect((await h.app.inject({ method: 'GET', url: `/studio/packs/${id}`, headers: bearer(token) })).json().pack.status).toBe(
      'DRAFT',
    );
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/submit`, headers: bearer(token) });
    await verifyPin(h.app, token, pin);
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/approve`, headers: bearer(token) });

    const log = await h.app.inject({
      method: 'GET',
      url: `/families/${me.json().familyId}/audit-log`,
      headers: bearer(token),
    });
    const pub = log.json().entries.find((e: { action: string }) => e.action === 'content_pack.published');
    expect(pub.metadata.aiGenerated).toBe(true);
  });

  it('reject: IN_REVIEW → DRAFT với ghi chú', async () => {
    const { token } = await registerParent(h.app);
    const id = (
      await h.app.inject({ method: 'POST', url: '/studio/packs', headers: bearer(token), payload: { pack: validPack() } })
    ).json().id;
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/submit`, headers: bearer(token) });
    const rej = await h.app.inject({
      method: 'POST',
      url: `/studio/packs/${id}/reject`,
      headers: bearer(token),
      payload: { note: 'câu hỏi hơi khó với lớp 1' },
    });
    expect(rej.json().status).toBe('DRAFT');
  });

  it('withdraw: PUBLISHED → WITHDRAWN → child không còn thấy', async () => {
    const { token, pin } = await registerParent(h.app);
    await verifyPin(h.app, token, pin);
    const id = (
      await h.app.inject({ method: 'POST', url: '/studio/packs', headers: bearer(token), payload: { pack: validPack() } })
    ).json().id;
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/submit`, headers: bearer(token) });
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/approve`, headers: bearer(token) });

    const childId = await createChild(h.app, token);
    const childTok = await openChildSession(h.app, token, childId);
    expect(
      (await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(childTok) })).json().packs.some(
        (p: { id: string }) => p.id === id,
      ),
    ).toBe(true);

    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/withdraw`, headers: bearer(token) });
    expect(
      (await h.app.inject({ method: 'GET', url: '/content/packs', headers: bearer(childTok) })).json().packs.some(
        (p: { id: string }) => p.id === id,
      ),
    ).toBe(false);
  });

  it('sửa pack đã IN_REVIEW -> 409', async () => {
    const { token } = await registerParent(h.app);
    const id = (
      await h.app.inject({ method: 'POST', url: '/studio/packs', headers: bearer(token), payload: { pack: validPack() } })
    ).json().id;
    await h.app.inject({ method: 'POST', url: `/studio/packs/${id}/submit`, headers: bearer(token) });
    const res = await h.app.inject({
      method: 'PUT',
      url: `/studio/packs/${id}`,
      headers: bearer(token),
      payload: { pack: validPack({ title: 'Đổi tên' }) },
    });
    expect(res.statusCode).toBe(409);
  });

  it('preview trả hình child-facing', async () => {
    const { token } = await registerParent(h.app);
    const id = (
      await h.app.inject({ method: 'POST', url: '/studio/packs', headers: bearer(token), payload: { pack: validPack() } })
    ).json().id;
    const pv = await h.app.inject({ method: 'GET', url: `/studio/packs/${id}/preview`, headers: bearer(token) });
    expect(pv.json().units[0].choices).toHaveLength(2);
    expect(pv.json().units[0].hintLevels).toEqual([1, 2]);
  });

  it('studio của family khác -> 404', async () => {
    const a = await registerParent(h.app);
    const b = await registerParent(h.app);
    const id = (
      await h.app.inject({ method: 'POST', url: '/studio/packs', headers: bearer(a.token), payload: { pack: validPack() } })
    ).json().id;
    const res = await h.app.inject({ method: 'GET', url: `/studio/packs/${id}`, headers: bearer(b.token) });
    expect(res.statusCode).toBe(404);
  });
});

describe('Content Studio — import JSON / CSV', () => {
  it('import JSON mảng: pack hợp lệ tạo DRAFT, pack lỗi vào error report', async () => {
    const { token } = await registerParent(h.app);
    const good = validPack({ title: 'Gói tốt' });
    const bad = validPack({ title: 'Gói lỗi' });
    (bad.units[0]!.quest_flow as Record<string, unknown>).reflection_prompt = ''; // phá S3

    const res = await h.app.inject({
      method: 'POST',
      url: '/studio/imports',
      headers: bearer(token),
      payload: { format: 'JSON', content: JSON.stringify([good, bad]) },
    });
    expect(res.statusCode).toBe(201);
    const b = res.json();
    expect(b.validCount).toBe(1);
    expect(b.createdPackIds).toHaveLength(1);
    expect(b.errorReport.length).toBe(1);

    const job = await h.app.inject({ method: 'GET', url: `/studio/imports/${b.jobId}`, headers: bearer(token) });
    expect(job.json().validCount).toBe(1);
  });

  it('import CSV: tạo DRAFT từ dòng hợp lệ', async () => {
    const { token } = await registerParent(h.app);
    const header =
      'pack_code,pack_title,stage,locale,license,author,unit_title,domains,primary_skill,secondary_skills,screen_min,offline_min,materials,choice1_id,choice1_label,choice2_id,choice2_label,hook,plan_prompt,explain_prompt,reflection_prompt,min_attempts,hint1_type,hint1_content,hint2_type,hint2_content,evidence,outcome_framework,outcome_desc';
    const row =
      'csv-g1,Gói CSV,BASE_CAMP,vi-VN,ORIGINAL_OR_LICENSED,Ba,Đếm ngón tay,MATHEMATICS|COMMUNICATION,MATH_NUMBER_SENSE,ORAL_EXPLANATION,4,12,hai tay,LEFT,tay trái,RIGHT,tay phải,Mỗi tay mấy ngón?,Con định đếm sao?,Sao con biết đủ?,Cách nào dễ hơn?,1,REPHRASE,Mình đếm hết,QUESTION,Đã hết tay chưa?,VOICE_EXPLANATION|CHILD_REFLECTION,VN_GDPT,Đếm trong 10';

    const res = await h.app.inject({
      method: 'POST',
      url: '/studio/imports',
      headers: bearer(token),
      payload: { format: 'CSV', content: `${header}\n${row}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().validCount).toBe(1);
    expect(res.json().errorReport).toEqual([]);

    const list = await h.app.inject({ method: 'GET', url: '/studio/packs', headers: bearer(token) });
    expect(list.json().packs.some((p: { code: string }) => p.code === 'csv-g1')).toBe(true);
  });

  it('import JSON hỏng cú pháp -> 400', async () => {
    const { token } = await registerParent(h.app);
    const res = await h.app.inject({
      method: 'POST',
      url: '/studio/imports',
      headers: bearer(token),
      payload: { format: 'JSON', content: '{ khong-phai-json' },
    });
    expect(res.statusCode).toBe(400);
  });
});
