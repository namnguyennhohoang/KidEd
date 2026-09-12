import { sql } from 'drizzle-orm';
import { buildServer } from './server.js';
import { runMigrations } from './db/migrate.js';
import { loadContent } from './content/loader.js';
import { seedTargetOverlays } from './learning/admissions.js';
import { seedSkills } from './content/skill-loader.js';
import { CONTENT_ROOT } from './paths.js';

async function main() {
  const { app, db, config } = await buildServer();
  await runMigrations(db);
  await seedTargetOverlays(db);
  await seedSkills(db);

  // Dev DX: tự seed nếu DB rỗng (idempotent). Production seed chạy tường minh qua `npm run db:seed`.
  if (config.NODE_ENV !== 'production') {
    const r = await db.execute(sql`select count(*)::int as n from content_pack`);
    if (((r.rows[0] as { n: number } | undefined)?.n ?? 0) === 0) {
      const report = await loadContent(db, CONTENT_ROOT);
      app.log.info(`Seed dev: ${report.loaded.length} pack, ${report.rejected.length} bị từ chối`);
    }
  }

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  app.log.info(`API sẵn sàng tại http://localhost:${config.API_PORT} (OpenAPI: /openapi.json)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
