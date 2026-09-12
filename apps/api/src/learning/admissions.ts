import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import type { admissionRule} from '../db/schema.js';
import { targetOverlay } from '../db/schema.js';

type Rule = typeof admissionRule.$inferSelect;

export const TARGET_OVERLAYS = [
  { code: 'TDN_GRADE_6', title: 'Lớp 6 Trường Trần Đại Nghĩa' },
  { code: 'TDN_SPECIALIZED_GRADE_10', title: 'Lớp 10 trường chuyên' },
  { code: 'GLOBAL_TOP_UNIVERSITY', title: 'Đại học quốc tế hàng đầu' },
] as const;

/** Seed 3 TargetOverlay (idempotent). */
export async function seedTargetOverlays(db: Database): Promise<void> {
  for (const o of TARGET_OVERLAYS) {
    const existing = await db.select({ id: targetOverlay.id }).from(targetOverlay).where(eq(targetOverlay.code, o.code));
    if (existing.length === 0) {
      await db.insert(targetOverlay).values({ id: `ovl_${o.code.toLowerCase()}`, code: o.code, title: o.title });
    }
  }
}

const COMPARE_FIELDS: Array<keyof Rule> = [
  'admissionYear',
  'institutionName',
  'effectiveDate',
  'eligibility',
  'examOrPortfolioStructure',
  'subjects',
  'durationInfo',
  'scoringMethod',
  'cutoff',
  'notes',
];

export interface FieldDiff {
  field: string;
  from: unknown;
  to: unknown;
}

/** So sánh field-level giữa hai quy chế (thường là hai năm liền kề của cùng cơ sở). */
export function diffRules(a: Rule, b: Rule): FieldDiff[] {
  const out: FieldDiff[] = [];
  for (const f of COMPARE_FIELDS) {
    const av = a[f] ?? null;
    const bv = b[f] ?? null;
    if (JSON.stringify(av) !== JSON.stringify(bv)) out.push({ field: f, from: av, to: bv });
  }
  return out;
}

export interface StalenessInfo {
  stale: boolean;
  reasons: string[];
  daysUntilReview: number | null;
}

/** Quy chế KHÔNG được mặc định còn hiệu lực: cảnh báo khi quá năm hoặc quá hạn rà soát. */
export function assessStaleness(rule: Rule, now: Date = new Date()): StalenessInfo {
  const reasons: string[] = [];
  const currentYear = now.getUTCFullYear();
  if (rule.admissionYear < currentYear) {
    reasons.push(`quy chế cho năm ${rule.admissionYear}, hiện đã là ${currentYear}`);
  }
  let daysUntilReview: number | null = null;
  if (rule.reviewByDate) {
    daysUntilReview = Math.ceil((rule.reviewByDate.getTime() - now.getTime()) / 86_400_000);
    if (daysUntilReview < 0) reasons.push(`quá hạn rà soát ${-daysUntilReview} ngày`);
  }
  if (!rule.sourceUrl || !rule.sourceCheckedDate) {
    reasons.push('thiếu nguồn chính thức hoặc ngày kiểm tra nguồn');
  }
  return { stale: reasons.length > 0, reasons, daysUntilReview };
}
