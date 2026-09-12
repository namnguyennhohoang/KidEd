import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';

export function registerHealthRoutes(app: FastifyInstance, db: Database): void {
  app.get('/health', async () => {
    let dbOk = false;
    try {
      await db.$client.query('select 1');
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return { status: dbOk ? 'ok' : 'degraded', db: dbOk, ts: new Date().toISOString() };
  });

  app.get('/health/content-count', async () => {
    const rows = await db.execute(sql`select count(*)::int as n from content_pack`);
    return { packs: (rows.rows[0] as { n: number } | undefined)?.n ?? 0 };
  });
}
