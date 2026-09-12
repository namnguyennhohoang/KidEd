import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { mkdirSync } from 'node:fs';
import * as schema from './schema.js';
import type { AppConfig } from '../config.js';
import { resolveFromRepoRoot } from '../paths.js';

/**
 * Client DB dùng chung cho code route. `$client` được chuẩn hoá cho cả hai driver:
 * - dev / test: PGlite (nhúng)  — ADR 0007
 * - production: Postgres thật qua `pg.Pool` khi có `DATABASE_URL`
 * Query builder của Drizzle (select/insert/update/delete/execute/transaction) giống nhau
 * ở hai driver nên phần lớn code không cần biết đang chạy driver nào.
 */
export interface DbClient {
  kind: 'pglite' | 'postgres';
  query(text: string): Promise<{ rows: unknown[] }>;
  close(): Promise<void>;
}

export type Database = Omit<ReturnType<typeof drizzlePglite<typeof schema>>, '$client'> & {
  $client: DbClient;
};

export async function createDatabase(config: AppConfig): Promise<Database> {
  if (config.DATABASE_URL) {
    // `pg` + node-postgres nạp động — không nằm trên đường chạy dev/test (PGlite).
    const [{ default: pg }, { drizzle: drizzlePg }] = await Promise.all([
      import('pg'),
      import('drizzle-orm/node-postgres'),
    ]);
    const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 10 });
    await pool.query('select 1'); // lỗi cấu hình lộ ngay
    const db = drizzlePg(pool, { schema }) as unknown as Database;
    db.$client = {
      kind: 'postgres',
      query: (text: string) => pool.query(text).then((r) => ({ rows: r.rows as unknown[] })),
      close: () => pool.end(),
    };
    return db;
  }

  let pglite: PGlite;
  if (config.NODE_ENV === 'test') {
    pglite = new PGlite(); // in-memory
  } else {
    const dir = resolveFromRepoRoot(config.PGLITE_DATA_DIR);
    mkdirSync(dir, { recursive: true });
    pglite = new PGlite(dir);
  }
  await pglite.waitReady;
  const db = drizzlePglite(pglite, { schema }) as unknown as Database;
  db.$client = {
    kind: 'pglite',
    query: (text: string) => pglite.query(text).then((r) => ({ rows: r.rows as unknown[] })),
    close: () => pglite.close(),
  };
  return db;
}

export { schema };
