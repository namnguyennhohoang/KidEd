/**
 * Hình dạng JSON thô của ContentPack/LearningUnit (snake_case) — đã qua
 * validateContentDoc trước khi loader dùng. Đây KHÔNG phải nguồn sự thật schema
 * (nguồn sự thật là packages/content-schema); chỉ để loader có kiểu an toàn.
 */

export interface RawSkillRef {
  skill_id: string;
  role: 'PRIMARY' | 'SECONDARY';
}

export interface RawOutcome {
  framework: string;
  code?: string;
  description: string;
}

export interface RawChoice {
  id: string;
  label: string;
}

export interface RawLearningUnit {
  id: string;
  schema_version: string;
  content_version: string;
  status: string;
  title: string;
  locale: string;
  stage: string;
  grades: number[];
  domains: string[];
  learning_outcomes?: RawOutcome[];
  skills: RawSkillRef[];
  prerequisites?: string[];
  duration_minutes: { screen: number; offline: number };
  materials?: string[];
  choices: RawChoice[];
  quest_flow: Record<string, unknown>;
  hints: Array<Record<string, unknown>>;
  evidence: string[];
  rubric_id?: string;
  adaptations?: Record<string, unknown>;
  safety?: { adult_required?: boolean; risk_level?: string };
  provenance: { author: string; reviewer?: string; source_refs?: unknown[]; license: string };
}

export interface RawContentPack {
  id: string;
  kind: 'CONTENT_PACK';
  schema_version: string;
  content_version: string;
  status: string;
  title: string;
  description?: string;
  locale: string;
  stage: string;
  grades: number[];
  target_overlays?: string[];
  provenance: { author: string; reviewer?: string; source_refs?: unknown[]; license: string };
  superseded_by?: string;
  units: RawLearningUnit[];
}
