import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
// @ts-expect-error - JS module không có type declaration
import { validateContentDoc } from '@tiny/content-schema';
import { eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import { contentPack, learningUnit, learningUnitSkill, learningUnitOutcome, skill } from '../db/schema.js';
import type { RawContentPack } from './raw-types.js';

export interface LoadResult {
  file: string;
  packId: string;
  units: number;
  action: 'inserted' | 'updated';
}

export interface LoadReport {
  loaded: LoadResult[];
  rejected: Array<{ file: string; findings: Array<{ rule_id: string; severity: string; message: string }> }>;
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : extname(p) === '.json' ? [p] : [];
  });
}

/**
 * Nạp mọi ContentPack hợp lệ trong `contentRoot` vào DB (idempotent).
 * Pack có ERROR validation bị TỪ CHỐI (CONTENT_AUTHORING.md §4) — không ghi vào DB.
 */
export async function loadContent(db: Database, contentRoot: string): Promise<LoadReport> {
  const report: LoadReport = { loaded: [], rejected: [] };

  for (const file of walk(contentRoot)) {
    const rel = relative(contentRoot, file).replace(/\\/g, '/');
    const doc = JSON.parse(readFileSync(file, 'utf8'));

    if (doc?.kind !== 'CONTENT_PACK') continue; // Slice 1 chỉ nạp pack

    const { ok, findings } = await validateContentDoc(doc);
    if (!ok) {
      report.rejected.push({
        file: rel,
        findings: findings.filter((f: { severity: string }) => f.severity === 'ERROR'),
      });
      continue;
    }

    const pack = doc as RawContentPack;
    await assertKnownSkills(db, pack, rel);
    const action = await upsertPack(db, pack, rel);
    report.loaded.push({ file: rel, packId: pack.id, units: pack.units.length, action });
  }

  return report;
}

/**
 * Mọi `skill_id` trong pack phải tồn tại trong Skill Graph (`skill.code`). Seed chạy
 * `seedSkills` trước `loadContent`, nên mã lạ = lỗi nội dung -> dừng sớm, thông báo rõ.
 */
async function assertKnownSkills(db: Database, doc: RawContentPack, rel: string): Promise<void> {
  const referenced = [
    ...new Set(doc.units.flatMap((u) => (u.skills ?? []).map((s) => s.skill_id))),
  ];
  if (referenced.length === 0) return;
  const known = new Set(
    (await db.select({ code: skill.code }).from(skill).where(inArray(skill.code, referenced))).map((r) => r.code),
  );
  const unknown = referenced.filter((c) => !known.has(c));
  if (unknown.length) {
    throw new Error(
      `Nội dung ${rel}: skill_id không có trong Skill Graph: ${unknown.join(', ')}. ` +
        `Thêm vào content/skills/skills.json trước.`,
    );
  }
}

async function upsertPack(
  db: Database,
  doc: RawContentPack,
  sourcePath: string,
): Promise<'inserted' | 'updated'> {
  const existing = await db.select({ id: contentPack.id }).from(contentPack).where(eq(contentPack.id, doc.id));
  const action = existing.length > 0 ? 'updated' : 'inserted';

  const packRow = {
    id: doc.id,
    code: doc.id,
    kind: 'CONTENT_PACK',
    schemaVersion: doc.schema_version,
    contentVersion: doc.content_version,
    // Nội dung trong repo đã được curate + review qua PR + validate -> coi là đã xuất bản.
    status: 'PUBLISHED',
    origin: 'REFERENCE',
    title: doc.title,
    description: doc.description ?? null,
    locale: doc.locale,
    stage: doc.stage,
    grades: doc.grades,
    targetOverlays: doc.target_overlays ?? null,
    provenanceAuthor: doc.provenance.author,
    provenanceReviewer: doc.provenance.reviewer ?? null,
    provenanceSourceRefs: doc.provenance.source_refs ?? null,
    license: doc.provenance.license,
    supersededBy: doc.superseded_by ?? null,
    sourcePath,
    publishedAt: new Date(),
    updatedAt: new Date(),
  };

  await db
    .insert(contentPack)
    .values(packRow)
    .onConflictDoUpdate({ target: contentPack.id, set: packRow });

  // Đơn giản & idempotent: xóa unit con của pack rồi ghi lại từ file (nguồn sự thật là file).
  await db.delete(learningUnit).where(eq(learningUnit.packId, doc.id));

  for (const u of doc.units) {
    await db.insert(learningUnit).values({
      id: u.id,
      packId: doc.id,
      title: u.title,
      locale: u.locale,
      stage: u.stage,
      status: u.status,
      schemaVersion: u.schema_version,
      contentVersion: u.content_version,
      grades: u.grades,
      domains: u.domains,
      durationScreenMin: u.duration_minutes.screen,
      durationOfflineMin: u.duration_minutes.offline,
      materials: u.materials ?? null,
      choices: u.choices,
      questFlow: u.quest_flow,
      hints: u.hints,
      evidence: u.evidence,
      rubricId: u.rubric_id ?? null,
      adaptations: u.adaptations ?? null,
      safetyAdultRequired: u.safety?.adult_required ?? false,
      safetyRiskLevel: u.safety?.risk_level ?? 'LOW',
      updatedAt: new Date(),
    });

    for (const s of u.skills ?? []) {
      await db.insert(learningUnitSkill).values({ unitId: u.id, skillId: s.skill_id, role: s.role });
    }
    const outcomes = u.learning_outcomes ?? [];
    for (let i = 0; i < outcomes.length; i++) {
      const o = outcomes[i]!;
      await db.insert(learningUnitOutcome).values({
        id: `${u.id}:${i}`,
        unitId: u.id,
        framework: o.framework,
        code: o.code ?? null,
        description: o.description,
      });
    }
  }

  return action;
}
