import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error - JS module không có type declaration, chấp nhận ở test
import { validateContentDoc, semanticUnitChecks } from '../index.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const goodPack = JSON.parse(
  readFileSync(join(repoRoot, 'content/packs/base-camp/vi-g1-base-camp-starter.pack.json'), 'utf8'),
);

describe('validateContentDoc', () => {
  it('gói mẫu đã duyệt: không có ERROR', async () => {
    const { ok, findings } = await validateContentDoc(goodPack);
    const errors = findings.filter((f: { severity: string }) => f.severity === 'ERROR');
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
  });

  it('bắt lỗi schema + semantic trên unit hỏng', async () => {
    const badUnit = {
      id: 'bad-unit',
      schema_version: '1.0.0',
      content_version: '1.0.0',
      status: 'DRAFT',
      title: 'Bài kém - trẻ dốt thì phải đậu',
      locale: 'vi-VN',
      stage: 'BASE_CAMP',
      grades: [1],
      domains: ['MATHEMATICS'],
      learning_outcomes: [],
      skills: [{ skill_id: 'X', role: 'SECONDARY' }],
      duration_minutes: { screen: 20, offline: 0 },
      choices: [{ id: 'A', label: 'a' }],
      quest_flow: {
        hook: 'h',
        plan_prompt: 'p',
        attempt_requirement: { minimum_attempts_before_solution: 0 },
        explain_prompt: 'e',
        reflection_prompt: '',
      },
      hints: [{ level: 2, type: 'WORKED_EXAMPLE', content: 'đáp án là 5 và 5' }],
      evidence: ['PHOTO_ARTIFACT'],
      adaptations: {},
      safety: { adult_required: false, risk_level: 'LOW' },
      provenance: { author: '', license: 'ORIGINAL_OR_LICENSED' },
    };
    const { ok, findings } = await validateContentDoc(badUnit);
    expect(ok).toBe(false);
    const ruleIds = new Set(findings.map((f: { rule_id: string }) => f.rule_id));
    for (const r of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S8', 'S9']) {
      expect(ruleIds.has(r)).toBe(true);
    }
  });

  it('S8: chặn cụm từ tạo áp lực/gắn nhãn', () => {
    const findings = semanticUnitChecks({ skills: [], choices: [], title: 'con phải đậu kỳ thi' });
    expect(findings.some((f: { rule_id: string }) => f.rule_id === 'S8')).toBe(true);
  });
});
