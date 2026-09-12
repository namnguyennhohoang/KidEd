import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { learningUnit, learningUnitSkill, skill } from '../db/schema.js';

/**
 * RAG tối giản cho AI Coach: gom vài đoạn NGẮN từ KHO ĐÃ DUYỆT (hints của nhiệm vụ +
 * mô tả kỹ năng theo tuổi) để LLM diễn đạt tự nhiên hơn. KHÔNG lấy hint vượt trần
 * (`maxHelpLadderLevel`) để không vô tình tiết lộ bước cuối. Gateway vẫn quét injection
 * trên các đoạn này; deterministic coach bỏ qua.
 */
const MAX_SNIPPETS = 6;
const MAX_LEN = 280;

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > MAX_LEN ? `${t.slice(0, MAX_LEN - 1)}…` : t;
}

/** Chọn đoạn mô tả kỹ năng khớp tuổi nhất từ `descriptionByAge` (khóa kiểu "6-8", "9-11"...). */
function pickByAge(byAge: Record<string, string> | null | undefined, age: number): string | null {
  if (!byAge) return null;
  const entries = Object.entries(byAge);
  for (const [range, text] of entries) {
    const m = range.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (m && age >= Number(m[1]) && age <= Number(m[2])) return text;
  }
  return entries[0]?.[1] ?? null;
}

export async function buildRetrievalContext(
  db: Database,
  args: { learningUnitId: string; maxHelpLadderLevel: number; childAgeYears: number },
): Promise<string[]> {
  const units = await db
    .select({ hints: learningUnit.hints, title: learningUnit.title })
    .from(learningUnit)
    .where(eq(learningUnit.id, args.learningUnitId));
  const unit = units[0];
  if (!unit) return [];

  const out: string[] = [];

  const hints = (unit.hints ?? []) as Array<{ level?: number; type?: string; content?: string }>;
  for (const h of hints
    .filter((h) => typeof h.content === 'string' && Number(h.level) <= args.maxHelpLadderLevel)
    .sort((a, b) => Number(a.level) - Number(b.level))) {
    out.push(clip(`Gợi ý nhiệm vụ (mức ${h.level}${h.type ? `, ${h.type}` : ''}): ${h.content}`));
  }

  const primarySkills = await db
    .select({ skillId: learningUnitSkill.skillId })
    .from(learningUnitSkill)
    .where(and(eq(learningUnitSkill.unitId, args.learningUnitId), eq(learningUnitSkill.role, 'PRIMARY')));
  const codes = primarySkills.map((s) => s.skillId);
  if (codes.length) {
    const rows = await db.select().from(skill).where(inArray(skill.code, codes));
    for (const r of rows) {
      const desc = pickByAge(r.descriptionByAge, args.childAgeYears);
      if (desc) out.push(clip(`Kỹ năng "${r.titleVi}": ${desc}`));
    }
  }

  return out.slice(0, MAX_SNIPPETS);
}
