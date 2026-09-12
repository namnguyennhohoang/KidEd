import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { createDatabase, type Database } from './client.js';
import { runMigrations } from './migrate.js';
import { buildServer } from '../server.js';
import { loadContent } from '../content/loader.js';
import { CONTENT_ROOT } from '../paths.js';

/**
 * CHỈ chạy khi có DATABASE_URL (job `postgres` trong CI). Bù rủi ro PGlite ≠ Postgres (ADR 0007):
 * DDL migration + một phiên học trọn vẹn phải chạy trên Postgres thật.
 * Local (không có DATABASE_URL) -> skip.
 */
const RUN = !!process.env.DATABASE_URL;

const config: AppConfig = {
  NODE_ENV: 'test',
  API_PORT: 4998,
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  PGLITE_DATA_DIR: 'memory://',
  STORAGE_DRIVER: 'filesystem',
  STORAGE_FS_DIR: mkdtempSync(join(tmpdir(), 'tiny-pg-smoke-')),
  S3_ENDPOINT: '',
  S3_BUCKET: 'tiny-artifacts',
  S3_ACCESS_KEY: '',
  S3_SECRET_KEY: '',
  DATA_USED_FOR_MODEL_TRAINING: false,
  AI_PROVIDER: 'PLUGGABLE',
  ANTHROPIC_API_KEY: '',
  AI_MODEL: 'claude-sonnet-5',
  AI_BASE_URL: 'https://api.anthropic.com',
  AI_TIMEOUT_MS: 8000,
  RETENTION_DAYS: 1095,
  AUDIT_RETENTION_DAYS: 1095,
  EXPORT_TTL_DAYS: 7,
};

describe.skipIf(!RUN)('Postgres smoke', () => {
  let db: Database;
  let app: FastifyInstance;
  let familyId: string;

  beforeAll(async () => {
    db = await createDatabase(config);
    await runMigrations(db);
    await loadContent(db, CONTENT_ROOT);
    ({ app } = await buildServer({ config, db }));
    await app.ready();
  });

  afterAll(async () => {
    if (familyId) await db.execute(sql`delete from family where id = ${familyId}`);
    await app?.close();
    await db?.$client.close();
  });

  it('driver là postgres', () => {
    expect(db.$client.kind).toBe('postgres');
  });

  it('đăng ký → child session → chu trình học trọn vẹn → minh chứng kỹ năng', async () => {
    const email = `pgsmoke_${Date.now()}@example.test`;
    const reg = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email, password: 'correct horse battery', familyName: 'PG', displayName: 'PG', pin: '246813' },
    });
    expect(reg.statusCode).toBe(201);
    const parentTok = reg.json().token as string;
    const P = { authorization: `Bearer ${parentTok}` };

    familyId = (await app.inject({ method: 'GET', url: '/auth/me', headers: P })).json().familyId;

    const child = await app.inject({
      method: 'POST',
      url: '/children',
      headers: P,
      payload: { displayName: 'Bé', birthMonth: 9, birthYear: 2020 },
    });
    const childId = child.json().id as string;
    const cs = await app.inject({ method: 'POST', url: `/children/${childId}/child-session`, headers: P });
    const C = { authorization: `Bearer ${cs.json().token}` };

    const start = await app.inject({
      method: 'POST',
      url: '/sessions',
      headers: C,
      payload: { learningUnitId: 'vi-g1-math-number-bonds-001', clientGeneratedId: `pg-${Date.now()}` },
    });
    const sid = start.json().id as string;
    await app.inject({ method: 'POST', url: `/sessions/${sid}/plan`, headers: C, payload: { text: 'kế hoạch' } });
    await app.inject({
      method: 'POST',
      url: `/sessions/${sid}/hint`,
      headers: C,
      payload: { signals: { childRequestedHelp: true, secondsSincePrompt: 60 } },
    });
    await app.inject({ method: 'POST', url: `/sessions/${sid}/attempts`, headers: C, payload: { content: { text: '6 và 4' } } });
    await app.inject({
      method: 'POST',
      url: `/sessions/${sid}/reflection`,
      headers: C,
      payload: { prompt: 'Bước nào con tự làm được nhất?', responseType: 'IMAGE_CHOICE', responseRef: 'easy' },
    });
    const done = await app.inject({ method: 'POST', url: `/sessions/${sid}/complete`, headers: C });
    expect(done.statusCode).toBe(200);

    const ev = await app.inject({ method: 'GET', url: `/children/${childId}/skill-evidence`, headers: P });
    expect(ev.json().totalEvidence).toBeGreaterThanOrEqual(3);

    // rule_firing ghi được trên Postgres
    const rf = await db.execute(sql`select count(*)::int as n from rule_firing where session_id = ${sid}`);
    expect((rf.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });
});
