import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadContent } from './loader.js';
import {
  makeHarness,
  registerParent,
  createChild,
  openChildSession,
  bearer,
  type Harness,
} from '../test-support/harness.js';

/**
 * CONTRACT (CONTENT_AUTHORING.md §5): một ContentPack MỚI hợp lệ chỉ là một file JSON.
 * Thêm file -> nạp được -> xuất hiện qua API -> trẻ chạy trọn phiên trên unit của nó
 * -> minh chứng kỹ năng được sinh — KHÔNG sửa một dòng mã ứng dụng nào.
 */
let h: Harness;

beforeAll(async () => {
  h = await makeHarness(); // đã seed 2 pack repo
});
afterAll(async () => {
  await h.close();
});

const NEW_PACK = {
  id: 'contract-pack-xyz',
  kind: 'CONTENT_PACK',
  schema_version: '1.0.0',
  content_version: '1.0.0',
  status: 'DRAFT',
  title: 'Gói hợp đồng — thêm không sửa code',
  locale: 'vi-VN',
  stage: 'BASE_CAMP',
  grades: [1],
  provenance: { author: 'Kiểm thử hợp đồng', license: 'ORIGINAL_OR_LICENSED' },
  units: [
    {
      id: 'contract-unit-xyz',
      schema_version: '1.0.0',
      content_version: '1.0.0',
      status: 'DRAFT',
      title: 'Xếp các viên sỏi thành nhóm',
      locale: 'vi-VN',
      stage: 'BASE_CAMP',
      grades: [1],
      domains: ['MATHEMATICS', 'EXECUTIVE_FUNCTION'],
      learning_outcomes: [{ framework: 'VN_GDPT', description: 'Phân nhóm theo một tiêu chí' }],
      skills: [
        { skill_id: 'MATH_NUMBER_SENSE', role: 'PRIMARY' },
        { skill_id: 'FLEXIBLE_THINKING', role: 'SECONDARY' },
      ],
      prerequisites: [],
      duration_minutes: { screen: 4, offline: 12 },
      materials: ['vài viên sỏi'],
      choices: [
        { id: 'COLOR', label: 'Con chia theo màu' },
        { id: 'SIZE', label: 'Con chia theo to nhỏ' },
      ],
      quest_flow: {
        hook: 'Con có một nắm sỏi nhiều màu và kích cỡ khác nhau.',
        predict_prompt: 'Con nghĩ có mấy cách chia nhóm?',
        plan_prompt: 'Con định chia theo tiêu chí nào trước?',
        attempt_requirement: { minimum_attempts_before_solution: 1 },
        explain_prompt: 'Vì sao con xếp viên này vào nhóm đó?',
        revision_prompt: 'Con thử chia lại theo một tiêu chí khác nhé?',
        reflection_prompt: 'Cách chia nào con thấy dễ hơn?',
      },
      hints: [
        { level: 1, type: 'REPHRASE', content: 'Mình đang xếp sỏi thành các nhóm giống nhau.' },
        { level: 2, type: 'QUESTION', content: 'Con nhìn xem viên nào giống viên nào?' },
      ],
      evidence: ['PHOTO_ARTIFACT', 'CHILD_REFLECTION'],
      adaptations: {},
      safety: { adult_required: false, risk_level: 'LOW' },
      provenance: { author: 'Kiểm thử hợp đồng', license: 'ORIGINAL_OR_LICENSED' },
    },
  ],
};

describe('Contract — nạp ContentPack mới không sửa code', () => {
  it('file JSON mới -> nạp, phục vụ qua API, chạy trọn phiên', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tiny-contract-'));
    try {
      writeFileSync(join(dir, 'new.pack.json'), JSON.stringify(NEW_PACK));

      // 1) Nạp — không sửa mã, chỉ trỏ loader vào thư mục chứa file mới.
      const report = await loadContent(h.db, dir);
      expect(report.rejected).toEqual([]);
      expect(report.loaded[0]!.packId).toBe('contract-pack-xyz');

      const parent = (await registerParent(h.app)).token;
      const childId = await createChild(h.app, parent);
      const childToken = await openChildSession(h.app, parent, childId);

      // 2) Xuất hiện qua API nội dung.
      const packs = await h.app.inject({
        method: 'GET',
        url: '/content/packs?stage=BASE_CAMP',
        headers: bearer(childToken),
      });
      expect(packs.json().packs.map((p: { id: string }) => p.id)).toContain('contract-pack-xyz');

      // 3) Trẻ chạy trọn chu trình trên unit MỚI.
      const start = await h.app.inject({
        method: 'POST',
        url: '/sessions',
        headers: bearer(childToken),
        payload: { learningUnitId: 'contract-unit-xyz', clientGeneratedId: 'contract-cg-1' },
      });
      expect(start.statusCode).toBe(201);
      const sid = start.json().id;
      expect(start.json().unit.choices).toHaveLength(2);

      await h.app.inject({ method: 'POST', url: `/sessions/${sid}/plan`, headers: bearer(childToken), payload: { choiceIds: ['COLOR'] } });

      const hint = await h.app.inject({
        method: 'POST',
        url: `/sessions/${sid}/hint`,
        headers: bearer(childToken),
        payload: { signals: { childRequestedHelp: true, secondsSincePrompt: 60 } },
      });
      // Hint dùng đúng nội dung hint của pack MỚI.
      expect(hint.json().coach.child_message).toMatch(/sỏi|nhóm|giống/);

      await h.app.inject({
        method: 'POST',
        url: `/sessions/${sid}/attempts`,
        headers: bearer(childToken),
        payload: { content: { text: 'chia theo màu' } },
      });
      await h.app.inject({
        method: 'POST',
        url: `/sessions/${sid}/reflection`,
        headers: bearer(childToken),
        payload: { prompt: 'Cách chia nào con thấy dễ hơn?', responseType: 'IMAGE_CHOICE', responseRef: 'easy' },
      });
      const done = await h.app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: bearer(childToken) });
      expect(done.statusCode).toBe(200);

      // 4) Minh chứng kỹ năng cho skill của pack MỚI.
      const ev = await h.app.inject({
        method: 'GET',
        url: `/children/${childId}/skill-evidence`,
        headers: bearer(parent),
      });
      expect(Object.keys(ev.json().bySkill)).toEqual(
        expect.arrayContaining(['MATH_NUMBER_SENSE', 'FLEXIBLE_THINKING']),
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
