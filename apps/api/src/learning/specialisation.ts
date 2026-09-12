import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { interestSignal, session, learningUnit } from '../db/schema.js';
import { buildReadiness } from './readiness.js';

/**
 * Giai đoạn 4 — SPECIALISATION (PRODUCT.md §5, lớp 6–7).
 * Chu kỳ trải nghiệm 8–12 tuần NHIỀU lĩnh vực; theo dõi hứng thú BỀN VỮNG qua nhiều tín hiệu
 * theo thời gian; khuyến khích giao thoa thế mạnh. KHÔNG chốt môn chuyên bằng một bài test →
 * module này KHÔNG sinh "môn nên chọn", KHÔNG điểm, KHÔNG xếp hạng.
 */

/** 12 domain hợp lệ — khớp packages/content-schema/schemas/common.schema.json `domain`. */
export const KNOWN_DOMAINS = [
  'VIETNAMESE_LITERACY',
  'MATHEMATICS',
  'ENGLISH',
  'SCIENCE',
  'SOCIAL_STUDIES',
  'ART_DESIGN',
  'MUSIC_PIANO',
  'PHYSICAL_WELLBEING',
  'COMMUNICATION',
  'SOCIAL_EMOTIONAL',
  'EXECUTIVE_FUNCTION',
  'DIGITAL_AI_LITERACY',
] as const;
export type Domain = (typeof KNOWN_DOMAINS)[number];

export const INTEREST_SOURCES = ['CHILD_SELF', 'PARENT_OBSERVED', 'SESSION_ENGAGEMENT'] as const;
export const INTEREST_STRENGTHS = ['LOW', 'MED', 'HIGH'] as const;

export const MIN_CYCLE_DOMAINS = 3;
export const MIN_PLANNED_WEEKS = 8;
export const MAX_PLANNED_WEEKS = 12;

export const SPECIALISATION_DISCLAIMER =
  'Đây là bức tranh hứng thú theo thời gian, không phải đo năng khiếu và không phải gợi ý "nên chọn môn nào". ' +
  'Việc chọn hướng chuyên cần cả một chu kỳ trải nghiệm 8–12 tuần ở nhiều lĩnh vực — không chốt bằng một tín hiệu hay một bài test.';

export function isDomain(x: string): x is Domain {
  return (KNOWN_DOMAINS as readonly string[]).includes(x);
}
export function isInterestSource(x: string): boolean {
  return (INTEREST_SOURCES as readonly string[]).includes(x);
}
export function isInterestStrength(x: string): boolean {
  return (INTEREST_STRENGTHS as readonly string[]).includes(x);
}

/** Nhãn tuần ISO ("2026-W37") để đếm số tuần RIÊNG BIỆT có tín hiệu. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const STRENGTH_WEIGHT: Record<string, number> = { LOW: 1, MED: 2, HIGH: 3 };
const SUSTAINED_MIN_WEEKS = 3;
const SUSTAINED_MIN_SPAN_DAYS = 21;
const SUSTAINED_MAX_GAP_DAYS = 35;

export type InterestTrend = 'RISING' | 'STEADY' | 'FADING' | 'SPARSE';

export interface DomainInterest {
  domain: string;
  signalCount: number;
  distinctWeeks: number;
  spanDays: number;
  maxGapDays: number;
  latestStrength: string | null;
  latestAt: string | null;
  sources: string[];
  trend: InterestTrend;
  /** Hứng thú BỀN VỮNG: >=3 tuần riêng biệt, trải >=21 ngày, không có khoảng lặng > 35 ngày. */
  sustained: boolean;
}

export interface InterestProfile {
  childId: string;
  byDomain: DomainInterest[];
  /** Cặp domain đồng xuất hiện trong các nhiệm vụ trẻ ĐÃ làm, và cả hai đều có tín hiệu hứng thú. */
  crossoverHints: Array<{ domains: [string, string]; sharedUnits: number }>;
  summary: { domainsWithSignal: number; sustainedDomains: number; totalSignals: number };
  disclaimer: string;
}

function trendOf(sorted: { at: number; w: number }[], now: number): InterestTrend {
  if (sorted.length < 3) return 'SPARSE';
  const mid = Math.floor(sorted.length / 2);
  const early = sorted.slice(0, mid);
  const late = sorted.slice(mid);
  const avg = (xs: { w: number }[]) => xs.reduce((s, x) => s + x.w, 0) / xs.length;
  const recentAt = sorted[sorted.length - 1]!.at;
  // Không có tín hiệu nào trong 45 ngày gần đây -> coi như đang phai.
  if (now - recentAt > 45 * 86_400_000) return 'FADING';
  const delta = avg(late) - avg(early);
  if (delta >= 0.5) return 'RISING';
  if (delta <= -0.5) return 'FADING';
  return 'STEADY';
}

/**
 * Tổng hợp interest_signal theo domain + gợi ý giao thoa. Không có "điểm hứng thú" tổng,
 * không sắp xếp domain theo "độ phù hợp", không đề xuất môn chuyên.
 */
export async function buildInterestProfile(
  db: Database,
  childProfileId: string,
  now: Date = new Date(),
): Promise<InterestProfile> {
  const signals = await db
    .select()
    .from(interestSignal)
    .where(eq(interestSignal.childProfileId, childProfileId));

  const groups = new Map<string, typeof signals>();
  for (const s of signals) {
    const arr = groups.get(s.domain) ?? [];
    arr.push(s);
    groups.set(s.domain, arr);
  }

  const byDomain: DomainInterest[] = [];
  for (const [domain, arr] of groups) {
    const times = arr.map((s) => s.observedAt.getTime()).sort((a, b) => a - b);
    const weeks = new Set(arr.map((s) => isoWeek(s.observedAt)));
    const spanDays = times.length > 1 ? Math.round((times[times.length - 1]! - times[0]!) / 86_400_000) : 0;
    let maxGapDays = 0;
    for (let i = 1; i < times.length; i += 1) {
      maxGapDays = Math.max(maxGapDays, Math.round((times[i]! - times[i - 1]!) / 86_400_000));
    }
    const latest = arr.reduce((a, b) => (a.observedAt >= b.observedAt ? a : b));
    const weighted = arr
      .map((s) => ({ at: s.observedAt.getTime(), w: STRENGTH_WEIGHT[s.strength] ?? 1 }))
      .sort((a, b) => a.at - b.at);
    const sustained =
      weeks.size >= SUSTAINED_MIN_WEEKS &&
      spanDays >= SUSTAINED_MIN_SPAN_DAYS &&
      maxGapDays <= SUSTAINED_MAX_GAP_DAYS;

    byDomain.push({
      domain,
      signalCount: arr.length,
      distinctWeeks: weeks.size,
      spanDays,
      maxGapDays,
      latestStrength: latest.strength,
      latestAt: latest.observedAt.toISOString(),
      sources: [...new Set(arr.map((s) => s.source))].sort(),
      trend: trendOf(weighted, now.getTime()),
      sustained,
    });
  }
  byDomain.sort((a, b) => a.domain.localeCompare(b.domain));

  // Giao thoa: nhiệm vụ trẻ đã làm, có >=2 domain trùng với domain đang có tín hiệu.
  const domainsWithSignal = new Set(byDomain.map((d) => d.domain));
  const doneUnits = await db
    .select({ domains: learningUnit.domains })
    .from(session)
    .innerJoin(learningUnit, eq(learningUnit.id, session.learningUnitId))
    .where(eq(session.childProfileId, childProfileId));

  const pairCount = new Map<string, number>();
  for (const u of doneUnits) {
    const ds = [...new Set((u.domains ?? []).filter((d) => domainsWithSignal.has(d)))].sort();
    for (let i = 0; i < ds.length; i += 1) {
      for (let j = i + 1; j < ds.length; j += 1) {
        const key = `${ds[i]}|${ds[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }
  const crossoverHints = [...pairCount.entries()]
    .map(([key, sharedUnits]) => {
      const [a, b] = key.split('|');
      return { domains: [a, b] as [string, string], sharedUnits };
    })
    .sort((x, y) => y.sharedUnits - x.sharedUnits || x.domains[0].localeCompare(y.domains[0]));

  return {
    childId: childProfileId,
    byDomain,
    crossoverHints,
    summary: {
      domainsWithSignal: byDomain.length,
      sustainedDomains: byDomain.filter((d) => d.sustained).length,
      totalSignals: signals.length,
    },
    disclaimer: SPECIALISATION_DISCLAIMER,
  };
}

/* ───────────────  SPEC_HS_READINESS — chốt môn chuyên + kế hoạch chiều sâu  ─────────────── */

export const SPEC_HS_OVERLAY = 'TDN_SPECIALIZED_GRADE_10';

export const SPEC_CHOICE_STATUSES = ['ACTIVE', 'SUPERSEDED', 'WITHDRAWN'] as const;

export const SPEC_CHOICE_DISCLAIMER =
  'Đây là hướng luyện tập đã chọn (một môn chính, một môn dự phòng) — KHÔNG phải cam kết và ' +
  'KHÔNG dự báo "chắc đậu/chắc rớt". Có thể đổi hoặc rút lại bất kỳ lúc nào; mỗi lần đổi đều được lưu lịch sử. ' +
  'Kế hoạch chiều sâu chỉ liệt kê kỹ năng cần luyện theo mức minh chứng hiện có, không xếp hạng.';

/** Ánh xạ "môn chuyên" (dùng mã domain) -> vị ngữ khớp mã kỹ năng. */
const SUBJECT_SKILL_PREFIX: Record<string, string[]> = {
  MATHEMATICS: ['MATH_'],
  SCIENCE: ['SCIENCE_'],
  VIETNAMESE_LITERACY: ['VIETNAMESE_', 'READING_', 'EVIDENCE_'],
  ENGLISH: ['ENGLISH_'],
  SOCIAL_STUDIES: ['SOCIAL_', 'EVIDENCE_'],
  DIGITAL_AI_LITERACY: ['DIGITAL_', 'AI_'],
};
/** Kỹ năng lập luận/liên môn luôn liên quan cho mọi môn chuyên. */
const SPEC_CROSS_SUBJECT_SKILLS = ['ARGUMENT_CONSTRUCTION', 'INTERDISCIPLINARY_APPLICATION', 'REASONING_PLANNING'];

export function skillMatchesSubject(skillCode: string, subject: string): boolean {
  if (SPEC_CROSS_SUBJECT_SKILLS.includes(skillCode)) return true;
  const prefixes = SUBJECT_SKILL_PREFIX[subject] ?? [];
  return prefixes.some((p) => skillCode.startsWith(p));
}

export interface DepthPlanItem {
  skillId: string;
  title: string | null;
  forSubject: 'PRIMARY' | 'BACKUP' | 'BOTH';
  band: string;
  confidence: string;
  notStarted: boolean;
}

export interface DepthPlan {
  overlay: string;
  primarySubject: string;
  backupSubject: string;
  items: DepthPlanItem[];
  disclaimer: string;
}

/**
 * Kế hoạch luyện chiều sâu cho môn chuyên đã chọn: kỹ năng thuộc overlay lớp-10-chuyên,
 * khớp môn chính/dự phòng, kèm mức sẵn sàng hiện tại (tái dùng buildReadiness). KHÔNG dự báo.
 */
export async function buildDepthPlan(
  db: Database,
  childProfileId: string,
  primarySubject: string,
  backupSubject: string,
  now: Date = new Date(),
): Promise<DepthPlan> {
  const readiness = await buildReadiness(db, childProfileId, SPEC_HS_OVERLAY, now);
  const items: DepthPlanItem[] = [];
  for (const s of readiness.bySkill) {
    const inPrimary = skillMatchesSubject(s.skillId, primarySubject);
    const inBackup = skillMatchesSubject(s.skillId, backupSubject);
    if (!inPrimary && !inBackup) continue;
    items.push({
      skillId: s.skillId,
      title: s.title,
      forSubject: inPrimary && inBackup ? 'BOTH' : inPrimary ? 'PRIMARY' : 'BACKUP',
      band: s.band,
      confidence: s.confidence,
      notStarted: s.notStarted,
    });
  }
  items.sort((a, b) => a.skillId.localeCompare(b.skillId));
  return {
    overlay: SPEC_HS_OVERLAY,
    primarySubject,
    backupSubject,
    items,
    disclaimer: SPEC_CHOICE_DISCLAIMER,
  };
}
