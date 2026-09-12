import { describe, it, expect } from 'vitest';
import { parseCsv, csvToPacks } from './csv.js';

describe('parseCsv', () => {
  it('tách dòng/cột cơ bản', () => {
    expect(parseCsv('a,b,c\n1,2,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });
  it('trường có dấu phẩy và xuống dòng trong ngoặc kép', () => {
    const rows = parseCsv('name,note\n"Bi","dòng 1\ndòng 2, có phẩy"');
    expect(rows[1]).toEqual(['Bi', 'dòng 1\ndòng 2, có phẩy']);
  });
  it('escape dấu ngoặc kép ""', () => {
    expect(parseCsv('x\n"a ""b"" c"')[1]).toEqual(['a "b" c']);
  });
});

const HEADER =
  'pack_code,pack_title,stage,locale,license,author,unit_title,domains,primary_skill,secondary_skills,screen_min,offline_min,materials,choice1_id,choice1_label,choice2_id,choice2_label,hook,plan_prompt,explain_prompt,reflection_prompt,min_attempts,hint1_type,hint1_content,hint2_type,hint2_content,evidence,outcome_framework,outcome_desc';

const ROW =
  'g1-mau,Gói mẫu,BASE_CAMP,vi-VN,ORIGINAL_OR_LICENSED,Ba,Đếm ngón tay,MATHEMATICS|COMMUNICATION,MATH_NUMBER_SENSE,ORAL_EXPLANATION,4,12,hai tay,LEFT,tay trái,RIGHT,tay phải,Mỗi tay mấy ngón?,Con định đếm sao?,Sao con biết đủ?,Cách nào dễ hơn?,1,REPHRASE,Mình đếm hết ngón,QUESTION,Đã hết tay chưa?,VOICE_EXPLANATION|CHILD_REFLECTION,VN_GDPT,Đếm trong 10';

describe('csvToPacks', () => {
  it('gom dòng theo pack_code -> pack doc hợp lệ về hình dạng', () => {
    const { packs, errors } = csvToPacks(`${HEADER}\n${ROW}`);
    expect(errors).toEqual([]);
    expect(packs).toHaveLength(1);
    const p = packs[0]!.doc as {
      id: string;
      units: Array<{
        domains: string[];
        skills: unknown[];
        quest_flow: { attempt_requirement: { minimum_attempts_before_solution: number } };
        hints: unknown[];
      }>;
    };
    expect(p.id).toBe('g1-mau');
    expect(p.units).toHaveLength(1);
    expect(p.units[0]!.domains).toEqual(['MATHEMATICS', 'COMMUNICATION']);
    expect(p.units[0]!.skills).toEqual([
      { skill_id: 'MATH_NUMBER_SENSE', role: 'PRIMARY' },
      { skill_id: 'ORAL_EXPLANATION', role: 'SECONDARY' },
    ]);
    expect(p.units[0]!.quest_flow.attempt_requirement.minimum_attempts_before_solution).toBe(1);
    expect(p.units[0]!.hints).toHaveLength(2);
  });

  it('dòng thiếu pack_code -> vào error report', () => {
    const { errors } = csvToPacks(`${HEADER}\n,Gói,BASE_CAMP`);
    expect(errors[0]!.errors[0]).toContain('pack_code');
  });
});
