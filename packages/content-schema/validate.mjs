/**
 * CLI validate nội dung — Giai đoạn 0/1.
 *
 *   node validate.mjs [thư mục nội dung]   (mặc định: ../../content)
 *
 * Exit code: 0 nếu không có ERROR, 1 nếu có ERROR.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContentDoc } from './index.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contentRoot = resolve(process.argv[2] ?? join(__dirname, '..', '..', 'content'));

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : extname(p) === '.json' ? [p] : [];
  });
}

async function main() {
  console.log(`Nội dung: ${contentRoot}`);
  const files = walk(contentRoot);
  if (files.length === 0) {
    console.log('Không tìm thấy file .json nào — bỏ qua.');
    return;
  }

  let errorCount = 0;
  let warnCount = 0;

  for (const file of files) {
    const rel = file.replace(contentRoot, '').replace(/\\/g, '/');
    let doc;
    try {
      doc = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.log(`✗ ${rel}\n  [ERROR] PARSE: ${e.message}`);
      errorCount++;
      continue;
    }

    // Bỏ qua file không phải ContentPack / LearningUnit (vd content/skills/skills.json).
    if (!doc || (doc.kind !== 'CONTENT_PACK' && !doc.quest_flow && !Array.isArray(doc.units))) {
      console.log(`- ${rel} (bỏ qua — không phải ContentPack/LearningUnit)`);
      continue;
    }

    const { findings } = await validateContentDoc(doc);
    const errs = findings.filter((f) => f.severity === 'ERROR');
    const warns = findings.filter((f) => f.severity === 'WARN');
    errorCount += errs.length;
    warnCount += warns.length;

    if (findings.length === 0) {
      console.log(`✓ ${rel}`);
    } else {
      const lines = findings.map((f) => `  [${f.severity}] ${f.rule_id} @ ${f.path}: ${f.message}`).join('\n');
      console.log(`${errs.length ? '✗' : '•'} ${rel}\n${lines}`);
    }
  }

  console.log(`\nKết quả: ${files.length} file, ${errorCount} ERROR, ${warnCount} WARN.`);
  process.exit(errorCount > 0 ? 1 : 0);
}

main();
