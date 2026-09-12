/**
 * @tiny/content-schema — API dùng lại được cho validate nội dung.
 *
 *   import { validateContentDoc, loadValidators } from '@tiny/content-schema';
 *
 * Hai tầng: (1) JSON Schema 2020-12 qua ajv, (2) semantic S1–S10 (thuần JS).
 * Xem docs/CONTENT_AUTHORING.md.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const SCHEMA_DIR = join(__dirname, 'schemas');

export const PRESSURE_BLOCKLIST = [
  'phải đậu',
  'chắc chắn đậu',
  'chắc chắn rớt',
  'kém hơn',
  'giỏi hơn bạn',
  'thông minh hơn',
  'xếp hạng',
  'top 1',
  'tụt chuẩn',
  'ngu',
  'dốt',
  'vô dụng',
];

let _ajvCache = null;

/** Nạp ajv + đăng ký toàn bộ schema. Trả null nếu chưa `npm install`. */
export async function loadValidators() {
  if (_ajvCache !== null) return _ajvCache;
  try {
    const { default: Ajv } = await import('ajv/dist/2020.js');
    const { default: addFormats } = await import('ajv-formats');
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    for (const name of readdirSync(SCHEMA_DIR)) {
      if (extname(name) !== '.json') continue;
      ajv.addSchema(JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8')), name);
    }
    _ajvCache = ajv;
  } catch {
    _ajvCache = false;
  }
  return _ajvCache || null;
}

/** Luật ngữ nghĩa S1–S10 trên một LearningUnit. */
export function semanticUnitChecks(unit, basePath = '') {
  const out = [];
  const at = (p) => `${basePath}${p}`;
  const push = (rule_id, severity, path, message) => out.push({ rule_id, severity, path, message });

  const skills = unit.skills ?? [];
  const outcomes = unit.learning_outcomes ?? [];
  if (!(outcomes.length >= 1 && skills.some((s) => s.role === 'PRIMARY'))) {
    push('S1', 'ERROR', at(''), 'Thiếu learning_outcome (>=1) hoặc >=1 PRIMARY skill');
  }

  const minAttempts = unit.quest_flow?.attempt_requirement?.minimum_attempts_before_solution;
  const hasPreAction = !!(unit.quest_flow?.plan_prompt || unit.quest_flow?.predict_prompt);
  if (!(hasPreAction && Number.isInteger(minAttempts) && minAttempts >= 1)) {
    push(
      'S2',
      'ERROR',
      at('/quest_flow'),
      'Cần hành động của trẻ trước lời giải (plan/predict prompt) và minimum_attempts_before_solution >= 1',
    );
  }

  if (!unit.quest_flow?.reflection_prompt) {
    push('S3', 'ERROR', at('/quest_flow/reflection_prompt'), 'Thiếu reflection_prompt');
  }

  const screen = unit.duration_minutes?.screen;
  const offline = unit.duration_minutes?.offline;
  if (!(Number.isInteger(screen) && Number.isInteger(offline) && offline > 0)) {
    push('S4', 'ERROR', at('/duration_minutes'), 'Cần thời lượng màn hình và ngoài màn hình; offline > 0');
  }

  if (!unit.provenance?.license || !unit.provenance?.author) {
    push('S5', 'ERROR', at('/provenance'), 'Thiếu provenance.author + provenance.license');
  }

  const hints = [...(unit.hints ?? [])].sort((a, b) => a.level - b.level);
  for (let i = 1; i < hints.length; i++) {
    if (hints[i].level < hints[i - 1].level) {
      push('S6a', 'ERROR', at('/hints'), 'Hint không sắp theo level tăng dần');
      break;
    }
  }
  for (const h of hints) {
    if (h.level <= 3 && h.type === 'WORKED_EXAMPLE') {
      push('S6', 'ERROR', at(`/hints (level ${h.level})`), 'Hint level <= 3 không được là WORKED_EXAMPLE');
    }
  }

  const choices = unit.choices ?? [];
  if (choices.length < 2 || choices.length > 3) {
    push('S9', 'ERROR', at('/choices'), 'Cần 2–3 lựa chọn cùng mục tiêu học tập');
  }

  if (unit.stage === 'BASE_CAMP' && Number.isInteger(screen) && Number.isInteger(offline) && offline < screen) {
    push('S10', 'WARN', at('/duration_minutes'), 'Base Camp: nên offline >= screen');
  }

  // So khớp theo ranh giới từ (Unicode) để tránh dương tính giả, vd "ngu" trong "nguồn".
  const haystack = ` ${JSON.stringify(unit).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ')} `;
  for (const phrase of PRESSURE_BLOCKLIST) {
    const p = phrase.toLowerCase();
    if (p.includes(' ') ? haystack.includes(` ${p} `) || haystack.includes(p) : haystack.includes(` ${p} `)) {
      push('S8', 'ERROR', at(''), `Chứa cụm từ tạo áp lực/gắn nhãn: "${phrase}"`);
    }
  }

  return out;
}

function collectUnits(doc) {
  if (doc?.kind === 'CONTENT_PACK' && Array.isArray(doc.units)) {
    return doc.units.map((u, i) => ({ unit: u, basePath: `#/units/${i}` }));
  }
  return [{ unit: doc, basePath: '' }];
}

/**
 * Validate một document (ContentPack hoặc LearningUnit).
 * @returns {Promise<{ ok: boolean, findings: Array<{rule_id,severity,path,message}> }>}
 */
export async function validateContentDoc(doc) {
  const findings = [];
  const ajv = await loadValidators();

  if (ajv) {
    const schemaName = doc?.kind === 'CONTENT_PACK' ? 'content-pack.schema.json' : 'learning-unit.schema.json';
    const validate = ajv.getSchema(schemaName);
    if (validate && !validate(doc)) {
      for (const err of validate.errors ?? []) {
        findings.push({
          rule_id: 'SCHEMA',
          severity: 'ERROR',
          path: err.instancePath || '/',
          message: err.message ?? 'schema error',
        });
      }
    }
  } else {
    findings.push({
      rule_id: 'SCHEMA',
      severity: 'WARN',
      path: '/',
      message: 'ajv chưa cài — bỏ qua kiểm tra schema (chạy `npm install`)',
    });
  }

  for (const { unit, basePath } of collectUnits(doc)) {
    findings.push(...semanticUnitChecks(unit, basePath));
  }

  return { ok: !findings.some((f) => f.severity === 'ERROR'), findings };
}
