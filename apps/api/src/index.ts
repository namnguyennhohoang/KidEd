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

  // Nạp lại ContentPack tham chiếu (content/) mỗi lần khởi động — kể cả production.
  // upsertPack ghi đè theo `id` (idempotent), chỉ đụng tới pack REFERENCE trong repo,
  // không đụng pack STUDIO của gia đình -> an toàn để chạy lại mỗi lần deploy. Nhờ vậy
  // sửa nội dung (content/*.json) rồi deploy là tự lên, không cần chạy `db:seed` tay.
  try {
    const report = await loadContent(db, CONTENT_ROOT);
    app.log.info(`Seed nội dung: ${report.loaded.length} pack, ${report.rejected.length} bị từ chối`);
    for (const r of report.rejected) {
      app.log.warn({ file: r.file, findings: r.findings }, 'Pack bị từ chối do lỗi validation — giữ nguyên bản cũ trong DB');
    }
  } catch (err) {
    // Lỗi nạp nội dung không được làm sập cả server — log rồi chạy tiếp với nội dung đã có.
    app.log.error(err, 'Nạp ContentPack thất bại, tiếp tục khởi động với nội dung hiện có trong DB');
  }

  await app.listen({ port: config.API_PORT, host: '0.0.0.0' });
  app.log.info(`API sẵn sàng tại http://localhost:${config.API_PORT} (OpenAPI: /openapi.json)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
