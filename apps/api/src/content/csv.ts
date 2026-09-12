/** Parser CSV tối giản (RFC 4180: hỗ trợ trường có dấu phẩy/xuống dòng trong dấu ngoặc kép). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

export interface CsvBuildResult {
  packs: Array<{ doc: Record<string, unknown>; rows: number[] }>;
  errors: Array<{ row: number; errors: string[] }>;
}

const pipeList = (v: string | undefined) =>
  (v ?? '')
    .split('|')
    .map((x) => x.trim())
    .filter(Boolean);

/**
 * CSV "phẳng": mỗi dòng = một LearningUnit. Nhóm theo `pack_code`.
 * Cột: pack_code, pack_title, stage, locale, license, author, unit_id, unit_title,
 * domains(|), primary_skill, secondary_skills(|), screen_min, offline_min, materials(|),
 * choice1_id, choice1_label, choice2_id, choice2_label, hook, predict_prompt, plan_prompt,
 * explain_prompt, revision_prompt, reflection_prompt, min_attempts,
 * hint1_type, hint1_content, hint2_type, hint2_content, evidence(|), outcome_framework, outcome_desc
 */
export function csvToPacks(text: string): CsvBuildResult {
  const table = parseCsv(text);
  const res: CsvBuildResult = { packs: [], errors: [] };
  if (table.length < 2) {
    res.errors.push({ row: 0, errors: ['CSV rỗng hoặc thiếu dòng tiêu đề'] });
    return res;
  }
  const header = table[0]!.map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const groups = new Map<string, { doc: Record<string, unknown>; rows: number[]; units: unknown[] }>();

  for (let r = 1; r < table.length; r++) {
    const line = table[r]!;
    const get = (name: string) => (idx(name) >= 0 ? (line[idx(name)] ?? '').trim() : '');
    const rowNo = r + 1; // 1-based, tính cả header
    const packCode = get('pack_code');
    if (!packCode) {
      res.errors.push({ row: rowNo, errors: ['thiếu pack_code'] });
      continue;
    }

    const unit: Record<string, unknown> = {
      id: get('unit_id') || `${packCode}-u${groups.get(packCode)?.units.length ?? 0}`,
      schema_version: '1.0.0',
      content_version: '1.0.0',
      status: 'DRAFT',
      title: get('unit_title'),
      locale: get('locale') || 'vi-VN',
      stage: get('stage') || 'BASE_CAMP',
      grades: [1],
      domains: pipeList(get('domains')),
      learning_outcomes: get('outcome_desc')
        ? [{ framework: get('outcome_framework') || 'VN_GDPT', description: get('outcome_desc') }]
        : [],
      skills: [
        ...(get('primary_skill') ? [{ skill_id: get('primary_skill'), role: 'PRIMARY' }] : []),
        ...pipeList(get('secondary_skills')).map((s) => ({ skill_id: s, role: 'SECONDARY' })),
      ],
      duration_minutes: { screen: Number(get('screen_min') || 0), offline: Number(get('offline_min') || 0) },
      materials: pipeList(get('materials')),
      choices: [
        { id: get('choice1_id') || 'A', label: get('choice1_label') },
        { id: get('choice2_id') || 'B', label: get('choice2_label') },
      ],
      quest_flow: {
        hook: get('hook'),
        predict_prompt: get('predict_prompt') || undefined,
        plan_prompt: get('plan_prompt'),
        attempt_requirement: { minimum_attempts_before_solution: Number(get('min_attempts') || 1) },
        explain_prompt: get('explain_prompt'),
        revision_prompt: get('revision_prompt') || undefined,
        reflection_prompt: get('reflection_prompt'),
      },
      hints: [
        ...(get('hint1_content')
          ? [{ level: 1, type: get('hint1_type') || 'REPHRASE', content: get('hint1_content') }]
          : []),
        ...(get('hint2_content')
          ? [{ level: 2, type: get('hint2_type') || 'QUESTION', content: get('hint2_content') }]
          : []),
      ],
      evidence: pipeList(get('evidence')),
      adaptations: {},
      safety: { adult_required: false, risk_level: 'LOW' },
      provenance: { author: get('author') || 'Không rõ', license: get('license') || 'ORIGINAL_OR_LICENSED' },
    };

    let g = groups.get(packCode);
    if (!g) {
      g = {
        doc: {
          id: packCode,
          kind: 'CONTENT_PACK',
          schema_version: '1.0.0',
          content_version: '1.0.0',
          status: 'DRAFT',
          title: get('pack_title') || packCode,
          locale: get('locale') || 'vi-VN',
          stage: get('stage') || 'BASE_CAMP',
          grades: [1],
          provenance: { author: get('author') || 'Không rõ', license: get('license') || 'ORIGINAL_OR_LICENSED' },
        },
        rows: [],
        units: [],
      };
      groups.set(packCode, g);
    }
    g.units.push(unit);
    g.rows.push(rowNo);
  }

  for (const g of groups.values()) {
    res.packs.push({ doc: { ...g.doc, units: g.units }, rows: g.rows });
  }
  return res;
}
