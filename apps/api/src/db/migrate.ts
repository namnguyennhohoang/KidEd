import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { createDatabase, type Database } from './client.js';
import { MIGRATIONS_DIR } from '../paths.js';

/** Chạy migration từ DB rỗng. Idempotent. Hoạt động với cả PGlite lẫn Postgres thật. */
export async function runMigrations(db: Database): Promise<void> {
  const opts = { migrationsFolder: MIGRATIONS_DIR };
  if (db.$client.kind === 'postgres') {
    const { migrate: migratePg } = await import('drizzle-orm/node-postgres/migrator');
    await migratePg(db as never, opts);
  } else {
    await migratePglite(db as never, opts);
  }
}

async function main() {
  const config = loadConfig();
  const db = await createDatabase(config);
  await runMigrations(db);
  await db.$client.close();
  console.log(`Migration hoàn tất (${db.$client.kind}).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
