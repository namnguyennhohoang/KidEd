import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.js';
import { createDatabase } from './db/client.js';
import { runMigrations } from './db/migrate.js';
import { loadContent } from './content/loader.js';
import { seedTargetOverlays } from './learning/admissions.js';
import { seedSkills } from './content/skill-loader.js';
import { CONTENT_ROOT } from './paths.js';

export { CONTENT_ROOT };

async function main() {
  const config = loadConfig();
  const db = await createDatabase(config);
  await runMigrations(db);
  await seedTargetOverlays(db);
  await seedSkills(db);

  const report = await loadContent(db, CONTENT_ROOT);

  for (const r of report.loaded) {
    console.log(`  ${r.action.padEnd(8)} ${r.packId} (${r.units} unit) <- ${r.file}`);
  }
  for (const r of report.rejected) {
    console.log(`  REJECTED ${r.file}`);
    for (const f of r.findings) console.log(`    [${f.severity}] ${f.rule_id}: ${f.message}`);
  }

  await db.$client.close();

  if (report.rejected.length > 0) {
    console.error(`\n${report.rejected.length} pack bị từ chối do lỗi validation.`);
    process.exit(1);
  }
  console.log(`\nSeed hoàn tất: ${report.loaded.length} pack.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
