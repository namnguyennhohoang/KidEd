import { and, eq, isNull, or } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  admissionRule,
  projectContribution,
  scholarProject,
  specialisationChoice,
  targetOverlay,
} from '../db/schema.js';
import { buildReadiness } from './readiness.js';
import { assessStaleness } from './admissions.js';

/**
 * Giai đoạn 5 — GLOBAL_SCHOLAR (PRODUCT.md §5, lớp 9–12).
 * Dự án dài hạn có vấn đề thật + hồ sơ chữ T (rộng + một mũi sâu) + provenance cho AI-assistance.
 * KHÔNG dự báo khả năng trúng tuyển, KHÔNG xếp hạng, KHÔNG chấm "độ cạnh tranh".
 */

export const SCHOLAR_PATHWAYS = ['US', 'UK', 'SG', 'CA', 'AU', 'UNDECIDED'] as const;
export type ScholarPathway = (typeof SCHOLAR_PATHWAYS)[number];

export const CONTRIBUTION_KINDS = ['RESEARCH', 'BUILD', 'WRITE', 'FIELDWORK', 'REVISION', 'OUTREACH'] as const;

/** Khớp DATA_MODEL §artifact.ai_assistance_level. */
export const AI_ASSISTANCE_LEVELS = ['NONE', 'HINTS_ONLY', 'CO_CREATED_TOOL', 'AI_GENERATED_DRAFT'] as const;
export type AiAssistanceLevel = (typeof AI_ASSISTANCE_LEVELS)[number];
/** Mức được coi là "người dẫn dắt" khi tính minh bạch (không phải để trừ điểm). */
const HUMAN_LED_LEVELS = new Set<string>(['NONE', 'HINTS_ONLY']);
/** Mức mà AI định hình sản phẩm -> BẮT BUỘC mô tả cụ thể. */
const NOTE_REQUIRED_LEVELS = new Set<string>(['CO_CREATED_TOOL', 'AI_GENERATED_DRAFT']);

export const MIN_TARGET_MONTHS = 3;
export const MAX_TARGET_MONTHS = 24;
export const MAX_ACTIVE_PROJECTS = 2;
export const AI_NOTE_MIN_LEN = 12;

export const SCHOLAR_DISCLAIMER =
  'Đây là hồ sơ minh chứng và bản kê khai hỗ trợ của AI — KHÔNG phải dự báo trúng tuyển, KHÔNG xếp hạng, ' +
  'KHÔNG chấm "độ cạnh tranh". Mỗi nước (Mỹ/Anh/Singapore/Canada/Úc) đánh giá theo cách khác nhau; ' +
  'phần khai báo AI ở đây để minh bạch, không phải để trừ điểm.';

export function isPathway(x: string): x is ScholarPathway {
  return (SCHOLAR_PATHWAYS as readonly string[]).includes(x);
}
export function isContributionKind(x: string): boolean {
  return (CONTRIBUTION_KINDS as readonly string[]).includes(x);
}
export function isAiAssistanceLevel(x: string): x is AiAssistanceLevel {
  return (AI_ASSISTANCE_LEVELS as readonly string[]).includes(x);
}
/**
 * Bản ghi hợp lệ khi: mức không thuộc nhóm bắt buộc mô tả, hoặc có ghi chú đủ dài.
 * NONE/HINTS_ONLY: người dẫn dắt — không bắt buộc mô tả. CO_CREATED_TOOL/AI_GENERATED_DRAFT: bắt buộc.
 */
export function aiProvenanceOk(level: string, note: string | null | undefined): boolean {
  if (!NOTE_REQUIRED_LEVELS.has(level)) return true;
  return typeof note === 'string' && note.trim().length >= AI_NOTE_MIN_LEN;
}

export interface ProjectSummary {
  id: string;
  title: string;
  pathway: string;
  status: string;
  disciplines: string[];
  contributionCount: number;
  aiAssistanceBreakdown: Record<string, number>;
  humanLedShare: number | null;
  /** Bản ghi khai báo có AI nhưng thiếu mô tả — lẽ ra route đã chặn; cờ này bắt dữ liệu cũ/xấu. */
  provenanceGaps: number;
}

export interface ScholarPortfolio {
  childId: string;
  projects: ProjectSummary[];
  tShape: {
    breadthDisciplines: string[];
    breadthCount: number;
    depthSubject: string | null;
    depthSecureOrDeveloping: number;
    hasSpike: boolean;
  };
  /** Quy chế tuyển sinh đã theo dõi, gom theo lộ trình quốc gia của các dự án. Không dự báo trúng tuyển. */
  pathwayReferences: Array<{
    pathway: string;
    verified: number;
    draft: number;
    needsReview: number;
    institutions: string[];
  }>;
  aiAssistanceBreakdown: Record<string, number>;
  humanLedShare: number | null;
  disclaimer: string;
}

function emptyBreakdown(): Record<string, number> {
  return Object.fromEntries(AI_ASSISTANCE_LEVELS.map((l) => [l, 0]));
}

/**
 * Tổng hợp danh mục học giả: theo dự án + hồ sơ chữ T + bản kê khai AI toàn cục.
 * "Chiều sâu" lấy từ specialisation_choice ACTIVE (nếu có) + readiness overlay lớp-10-chuyên.
 */
export async function buildScholarPortfolio(
  db: Database,
  childProfileId: string,
  familyId: string,
  now: Date = new Date(),
): Promise<ScholarPortfolio> {
  const projects = await db
    .select()
    .from(scholarProject)
    .where(eq(scholarProject.childProfileId, childProfileId));
  const contributions = await db
    .select()
    .from(projectContribution)
    .where(eq(projectContribution.childProfileId, childProfileId));

  const byProject = new Map<string, typeof contributions>();
  for (const c of contributions) {
    const arr = byProject.get(c.projectId) ?? [];
    arr.push(c);
    byProject.set(c.projectId, arr);
  }

  const globalBreakdown = emptyBreakdown();
  let globalHumanLed = 0;
  const projectSummaries: ProjectSummary[] = projects
    .map((p) => {
      const cs = byProject.get(p.id) ?? [];
      const breakdown = emptyBreakdown();
      let humanLed = 0;
      let gaps = 0;
      for (const c of cs) {
        breakdown[c.aiAssistanceLevel] = (breakdown[c.aiAssistanceLevel] ?? 0) + 1;
        globalBreakdown[c.aiAssistanceLevel] = (globalBreakdown[c.aiAssistanceLevel] ?? 0) + 1;
        if (HUMAN_LED_LEVELS.has(c.aiAssistanceLevel)) {
          humanLed += 1;
          globalHumanLed += 1;
        }
        if (!aiProvenanceOk(c.aiAssistanceLevel, c.aiAssistanceNote)) gaps += 1;
      }
      return {
        id: p.id,
        title: p.title,
        pathway: p.pathway,
        status: p.status,
        disciplines: p.disciplines ?? [],
        contributionCount: cs.length,
        aiAssistanceBreakdown: breakdown,
        humanLedShare: cs.length ? humanLed / cs.length : null,
        provenanceGaps: gaps,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

  // Hồ sơ chữ T — bề rộng lấy từ nhóm kỹ năng đã có minh chứng + lĩnh vực các dự án.
  const readiness = await buildReadiness(db, childProfileId, null, now);
  const breadthDisciplines = new Set<string>();
  for (const s of readiness.bySkill) {
    if (!s.notStarted && s.group) breadthDisciplines.add(s.group);
  }
  for (const p of projectSummaries) for (const d of p.disciplines) breadthDisciplines.add(d);

  // Chiều sâu: môn chuyên đang chọn (nếu có) + số kỹ năng overlay lớp-10-chuyên đã vững/đang lên.
  const choiceRows = await db
    .select({ primary: specialisationChoice.primarySubject })
    .from(specialisationChoice)
    .where(
      and(
        eq(specialisationChoice.childProfileId, childProfileId),
        eq(specialisationChoice.status, 'ACTIVE'),
      ),
    );
  let depthSubject: string | null = null;
  let depthSecureOrDeveloping = 0;
  if (choiceRows[0]) {
    depthSubject = choiceRows[0].primary;
    const specReadiness = await buildReadiness(db, childProfileId, 'TDN_SPECIALIZED_GRADE_10', now);
    depthSecureOrDeveloping = specReadiness.bySkill.filter(
      (s) => !s.notStarted && (s.band === 'SECURE' || s.band === 'DEVELOPING'),
    ).length;
  }

  // Quy chế tuyển sinh đã theo dõi, gom theo lộ trình quốc gia của các dự án (overlay GLOBAL_TOP_UNIVERSITY).
  const projectPathways = [...new Set(projects.map((p) => p.pathway).filter((p) => p !== 'UNDECIDED'))];
  const pathwayReferences: Array<{
    pathway: string;
    verified: number;
    draft: number;
    needsReview: number;
    institutions: string[];
  }> = [];
  if (projectPathways.length) {
    const globalOverlay = await db
      .select({ id: targetOverlay.id })
      .from(targetOverlay)
      .where(eq(targetOverlay.code, 'GLOBAL_TOP_UNIVERSITY'));
    const oid = globalOverlay[0]?.id ?? null;
    const rules = oid
      ? await db
          .select()
          .from(admissionRule)
          .where(
            and(
              eq(admissionRule.targetOverlayId, oid),
              or(isNull(admissionRule.familyId), eq(admissionRule.familyId, familyId)),
            ),
          )
      : [];
    for (const pathway of projectPathways) {
      const forPath = rules.filter((r) => r.pathwayCode === pathway && r.status !== 'ARCHIVED');
      pathwayReferences.push({
        pathway,
        verified: forPath.filter((r) => r.status === 'VERIFIED').length,
        draft: forPath.filter((r) => r.status === 'DRAFT').length,
        needsReview: forPath.filter((r) => assessStaleness(r, now).stale).length,
        institutions: [...new Set(forPath.map((r) => r.institutionCode))].sort(),
      });
    }
    pathwayReferences.sort((a, b) => a.pathway.localeCompare(b.pathway));
  }

  const totalContrib = contributions.length;
  return {
    childId: childProfileId,
    projects: projectSummaries,
    tShape: {
      breadthDisciplines: [...breadthDisciplines].sort(),
      breadthCount: breadthDisciplines.size,
      depthSubject,
      depthSecureOrDeveloping,
      hasSpike: depthSubject !== null && depthSecureOrDeveloping >= 1,
    },
    pathwayReferences,
    aiAssistanceBreakdown: globalBreakdown,
    humanLedShare: totalContrib ? globalHumanLed / totalContrib : null,
    disclaimer: SCHOLAR_DISCLAIMER,
  };
}
