import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { loadContent } from './loader.js';
import { CONTENT_ROOT } from '../seed.js';
import { makeHarness, registerParent, bearer, type Harness } from '../test-support/harness.js';

let h: Harness;
let parentToken: string;

beforeAll(async () => {
  h = await makeHarness({ seedContent: false }); // test này tự gọi loadContent để kiểm tra insert/idempotent
  parentToken = (await registerParent(h.app)).token;
});

afterAll(async () => {
  await h.close();
});

async function count(table: string): Promise<number> {
  const r = await h.db.execute(sql.raw(`select count(*)::int as n from ${table}`));
  return (r.rows[0] as { n: number }).n;
}

describe('loadContent — nạp nội dung', () => {
  it('nạp gói mẫu đã duyệt từ content/', async () => {
    const report = await loadContent(h.db, CONTENT_ROOT);
    expect(report.rejected).toEqual([]);
    expect(report.loaded.length).toBeGreaterThanOrEqual(1);
    expect(report.loaded[0]!.action).toBe('inserted');
    expect(await count('content_pack')).toBe(11);
    expect(await count('learning_unit')).toBe(16);
    expect(await count('learning_unit_skill')).toBe(48);
  });

  it('idempotent: nạp lại không đổi số lượng, action = updated', async () => {
    const report = await loadContent(h.db, CONTENT_ROOT);
    expect(report.loaded.every((r) => r.action === 'updated')).toBe(true);
    expect(await count('content_pack')).toBe(11);
    expect(await count('learning_unit')).toBe(16);
    expect(await count('learning_unit_skill')).toBe(48);
    expect(await count('learning_unit_outcome')).toBe(16);
  });

  it('từ chối pack có lỗi validation (không ghi vào DB)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiny-badcontent-'));
    try {
      writeFileSync(
        join(dir, 'bad.pack.json'),
        JSON.stringify({
          id: 'bad-pack',
          kind: 'CONTENT_PACK',
          schema_version: '1.0.0',
          content_version: '1.0.0',
          status: 'DRAFT',
          title: 'gói hỏng',
          locale: 'vi-VN',
          stage: 'BASE_CAMP',
          grades: [1],
          provenance: { author: 'x', license: 'ORIGINAL_OR_LICENSED' },
          units: [
            {
              id: 'bad-pack-u1',
              schema_version: '1.0.0',
              content_version: '1.0.0',
              status: 'DRAFT',
              title: 'unit hỏng',
              locale: 'vi-VN',
              stage: 'BASE_CAMP',
              grades: [1],
              domains: ['MATHEMATICS'],
              learning_outcomes: [],
              skills: [{ skill_id: 'X', role: 'SECONDARY' }],
              duration_minutes: { screen: 10, offline: 0 },
              choices: [{ id: 'A', label: 'a' }],
              quest_flow: {
                hook: 'h',
                plan_prompt: 'p',
                attempt_requirement: { minimum_attempts_before_solution: 0 },
                explain_prompt: 'e',
                reflection_prompt: '',
              },
              hints: [{ level: 1, type: 'REPHRASE', content: 'x' }],
              evidence: ['PHOTO_ARTIFACT'],
              adaptations: {},
              safety: { adult_required: false, risk_level: 'LOW' },
              provenance: { author: 'x', license: 'ORIGINAL_OR_LICENSED' },
            },
          ],
        }),
      );
      const report = await loadContent(h.db, dir);
      expect(report.loaded).toEqual([]);
      expect(report.rejected.length).toBe(1);
      expect(await count('content_pack')).toBe(11); // vẫn chỉ các pack hợp lệ có sẵn
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pack hợp lệ nhưng skill_id không có trong Skill Graph -> ném lỗi, không ghi DB', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiny-badskill-'));
    try {
      writeFileSync(
        join(dir, 'ghost-skill.pack.json'),
        JSON.stringify({
          id: 'ghost-skill-pack',
          kind: 'CONTENT_PACK',
          schema_version: '1.0.0',
          content_version: '1.0.0',
          status: 'DRAFT',
          title: 'Gói dùng skill ma',
          locale: 'vi-VN',
          stage: 'BASE_CAMP',
          grades: [1],
          provenance: { author: 'x', license: 'ORIGINAL_OR_LICENSED' },
          units: [
            {
              id: 'ghost-skill-u1',
              schema_version: '1.0.0',
              content_version: '1.0.0',
              status: 'DRAFT',
              title: 'Nhiệm vụ skill ma',
              locale: 'vi-VN',
              stage: 'BASE_CAMP',
              grades: [1],
              domains: ['MATHEMATICS'],
              learning_outcomes: [{ framework: 'VN_GDPT', description: 'Đếm đến 10' }],
              skills: [
                { skill_id: 'MATH_NUMBER_SENSE', role: 'PRIMARY' },
                { skill_id: 'DEFINITELY_NOT_A_REAL_SKILL', role: 'SECONDARY' },
              ],
              duration_minutes: { screen: 10, offline: 15 },
              materials: ['giấy'],
              choices: [
                { id: 'A', label: 'a' },
                { id: 'B', label: 'b' },
              ],
              quest_flow: {
                hook: 'h',
                predict_prompt: 'con đoán bao nhiêu?',
                plan_prompt: 'p',
                attempt_requirement: { minimum_attempts_before_solution: 1 },
                explain_prompt: 'e',
                revision_prompt: 'thử lại nhé?',
                reflection_prompt: 'con thấy sao?',
              },
              hints: [
                { level: 1, type: 'REPHRASE', content: 'x' },
                { level: 2, type: 'QUESTION', content: 'y' },
              ],
              evidence: ['PARENT_OBSERVATION', 'CHILD_REFLECTION'],
              adaptations: {},
              safety: { adult_required: false, risk_level: 'LOW' },
              provenance: { author: 'x', license: 'ORIGINAL_OR_LICENSED' },
            },
          ],
        }),
      );
      await expect(loadContent(h.db, dir)).rejects.toThrow(/DEFINITELY_NOT_A_REAL_SKILL/);
      expect(await count('content_pack')).toBe(11); // không pack nào bị ghi thêm
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('API nội dung (yêu cầu đăng nhập)', () => {
  it('GET /health -> ok (không cần auth)', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe('ok');
  });

  it('GET /openapi.json -> có openapi', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/openapi.json' });
    expect(res.statusCode).toBe(200);
    expect(res.json().openapi).toBeTruthy();
  });

  it('GET /content/packs không token -> 401', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/content/packs' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /content/packs với token -> trả pack đã seed', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/content/packs?stage=BASE_CAMP',
      headers: bearer(parentToken),
    });
    expect(res.statusCode).toBe(200);
    const { packs } = res.json();
    expect(packs.length).toBeGreaterThanOrEqual(2);
    expect(packs.map((p: { id: string }) => p.id)).toContain('vi-g1-base-camp-starter');
    expect(packs.map((p: { id: string }) => p.id)).toContain('vi-g1-observe-shadows');
  });

  it('GET /content/units/:id với token -> unit + skills', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/content/units/vi-g1-math-number-bonds-001',
      headers: bearer(parentToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().unit.id).toBe('vi-g1-math-number-bonds-001');
    expect(res.json().skills.some((s: { role: string }) => s.role === 'PRIMARY')).toBe(true);
  });

  it('GET /content/units/:id không tồn tại -> 404', async () => {
    const res = await h.app.inject({
      method: 'GET',
      url: '/content/units/khong-co',
      headers: bearer(parentToken),
    });
    expect(res.statusCode).toBe(404);
  });
});
