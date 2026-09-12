import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { makeHarness, type Harness } from '../test-support/harness.js';
import { buildRetrievalContext } from './retrieval.js';

let h: Harness;
const UNIT = 'vi-g1-math-number-bonds-001'; // hints mức 1 & 2; PRIMARY skill MATH_NUMBER_SENSE

beforeAll(async () => {
  h = await makeHarness();
});
afterAll(async () => {
  await h.close();
});

describe('buildRetrievalContext (RAG từ kho đã duyệt)', () => {
  it('lấy hints ≤ trần + mô tả kỹ năng theo tuổi', async () => {
    const ctx = await buildRetrievalContext(h.db, { learningUnitId: UNIT, maxHelpLadderLevel: 2, childAgeYears: 6 });
    expect(ctx.length).toBeGreaterThanOrEqual(2);
    expect(ctx.some((s) => s.startsWith('Gợi ý nhiệm vụ (mức 1'))).toBe(true);
    expect(ctx.some((s) => s.startsWith('Gợi ý nhiệm vụ (mức 2'))).toBe(true);
    expect(ctx.some((s) => s.startsWith('Kỹ năng "Cảm nhận số"'))).toBe(true);
    // đúng bucket tuổi 5-7
    expect(ctx.find((s) => s.startsWith('Kỹ năng "Cảm nhận số"'))).toMatch(/vật thật rồi tới hình/);
  });

  it('KHÔNG lấy hint vượt trần', async () => {
    const ctx = await buildRetrievalContext(h.db, { learningUnitId: UNIT, maxHelpLadderLevel: 1, childAgeYears: 6 });
    expect(ctx.some((s) => s.startsWith('Gợi ý nhiệm vụ (mức 1'))).toBe(true);
    expect(ctx.some((s) => s.startsWith('Gợi ý nhiệm vụ (mức 2'))).toBe(false);
  });

  it('trần 0 -> không có hint nào của nhiệm vụ này (hints bắt đầu từ mức 1)', async () => {
    const ctx = await buildRetrievalContext(h.db, { learningUnitId: UNIT, maxHelpLadderLevel: 0, childAgeYears: 6 });
    expect(ctx.some((s) => s.startsWith('Gợi ý nhiệm vụ'))).toBe(false);
  });

  it('bucket tuổi khác -> đoạn mô tả khác', async () => {
    const ctx = await buildRetrievalContext(h.db, { learningUnitId: UNIT, maxHelpLadderLevel: 2, childAgeYears: 10 });
    expect(ctx.find((s) => s.startsWith('Kỹ năng "Cảm nhận số"'))).toMatch(/Ước lượng, so sánh/);
  });

  it('unit không tồn tại -> []', async () => {
    expect(await buildRetrievalContext(h.db, { learningUnitId: 'khong-co', maxHelpLadderLevel: 6, childAgeYears: 8 })).toEqual([]);
  });
});
