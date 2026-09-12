import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config.js';
import { createDatabase, type Database } from '../db/client.js';
import { runMigrations } from '../db/migrate.js';
import { buildServer } from '../server.js';
import { loadContent } from '../content/loader.js';
import { seedTargetOverlays } from '../learning/admissions.js';
import { seedSkills } from '../content/skill-loader.js';
import { CONTENT_ROOT } from '../paths.js';

export const TEST_CONFIG: AppConfig = {
  NODE_ENV: 'test',
  API_PORT: 4999,
  DATABASE_URL: '',
  PGLITE_DATA_DIR: 'memory://',
  STORAGE_DRIVER: 'filesystem',
  STORAGE_FS_DIR: mkdtempSync(join(tmpdir(), 'tiny-test-uploads-')),
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

export interface Harness {
  app: FastifyInstance;
  db: Database;
  close: () => Promise<void>;
}

export async function makeHarness(opts: { seedContent?: boolean } = {}): Promise<Harness> {
  const db = await createDatabase(TEST_CONFIG);
  await runMigrations(db);
  await seedTargetOverlays(db);
  await seedSkills(db);
  if (opts.seedContent !== false) {
    await loadContent(db, CONTENT_ROOT);
  }
  const { app } = await buildServer({ config: TEST_CONFIG, db });
  await app.ready();
  return {
    app,
    db,
    close: async () => {
      await app.close();
      await db.$client.close();
    },
  };
}

let seq = 0;

/** Đăng ký một gia đình mới, trả token phiên phụ huynh. */
export async function registerParent(
  app: FastifyInstance,
  over: Partial<{ email: string; pin: string }> = {},
): Promise<{ token: string; email: string; pin: string }> {
  seq += 1;
  const email = over.email ?? `parent${seq}_${Date.now()}@example.test`;
  const pin = over.pin ?? '246813';
  const res = await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: {
      email,
      password: 'correct horse battery',
      familyName: `Gia đình ${seq}`,
      displayName: `Phụ huynh ${seq}`,
      pin,
    },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.statusCode} ${res.body}`);
  return { token: res.json().token as string, email, pin };
}

export function bearer(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export async function createChild(
  app: FastifyInstance,
  token: string,
  over: Record<string, unknown> = {},
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/children',
    headers: bearer(token),
    payload: { displayName: 'Bé', birthMonth: 9, birthYear: 2020, ...over },
  });
  if (res.statusCode !== 201) throw new Error(`createChild failed: ${res.statusCode} ${res.body}`);
  return res.json().id as string;
}

export async function openChildSession(
  app: FastifyInstance,
  parentToken: string,
  childId: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: `/children/${childId}/child-session`,
    headers: bearer(parentToken),
  });
  if (res.statusCode !== 201) throw new Error(`openChildSession failed: ${res.statusCode} ${res.body}`);
  return res.json().token as string;
}

export async function verifyPin(app: FastifyInstance, token: string, pin: string): Promise<void> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/parent-pin/verify',
    headers: bearer(token),
    payload: { pin },
  });
  if (res.statusCode !== 200) throw new Error(`verifyPin failed: ${res.statusCode} ${res.body}`);
}
