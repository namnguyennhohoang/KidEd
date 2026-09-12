import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { Database } from '../db/client.js';
import { skill } from '../db/schema.js';
import { REPO_ROOT } from '../paths.js';

const skillSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  group: z.enum([
    'ACADEMIC',
    'COGNITIVE',
    'METACOGNITIVE',
    'EXECUTIVE_FUNCTION',
    'COMMUNICATION',
    'SOCIAL_EMOTIONAL',
    'ART_DESIGN',
    'MUSIC_PIANO',
    'PHYSICAL',
    'DIGITAL_AI_LITERACY',
  ]),
  titleVi: z.string().min(1),
  descriptionByAge: z.record(z.string()).optional(),
  prerequisites: z.array(z.string()).optional(),
  acceptedEvidenceTypes: z.array(z.string()).optional(),
  stageRelevance: z.array(z.string()).optional(),
  overlays: z.array(z.string()).optional(),
});

/** Seed Skill Graph từ content/skills/skills.json (idempotent theo `code`). */
export async function seedSkills(db: Database): Promise<number> {
  const path = join(REPO_ROOT, 'content', 'skills', 'skills.json');
  if (!existsSync(path)) return 0;
  const parsed = z.object({ skills: z.array(skillSchema) }).parse(JSON.parse(readFileSync(path, 'utf8')));
  for (const s of parsed.skills) {
    const row = {
      code: s.code,
      group: s.group,
      titleVi: s.titleVi,
      descriptionByAge: s.descriptionByAge ?? null,
      prerequisites: s.prerequisites ?? null,
      acceptedEvidenceTypes: s.acceptedEvidenceTypes ?? null,
      stageRelevance: s.stageRelevance ?? null,
      overlays: s.overlays ?? null,
    };
    await db.insert(skill).values(row).onConflictDoUpdate({ target: skill.code, set: row });
  }
  return parsed.skills.length;
}
