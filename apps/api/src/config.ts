import { z } from 'zod';

/** Cấu hình từ biến môi trường. Secret chỉ ở server (SECURITY.md §7). */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),

  /** Trống -> PGlite nhúng ở PGLITE_DATA_DIR. Có giá trị -> Postgres thật. */
  DATABASE_URL: z.string().default(''),
  PGLITE_DATA_DIR: z.string().default('./data/pglite'),

  STORAGE_DRIVER: z.enum(['filesystem', 's3']).default('filesystem'),
  STORAGE_FS_DIR: z.string().default('./data/uploads'),
  S3_ENDPOINT: z.string().default(''),
  S3_BUCKET: z.string().default('tiny-artifacts'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),

  DATA_USED_FOR_MODEL_TRAINING: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  AI_PROVIDER: z.string().default('PLUGGABLE'),
  /** Chỉ dùng khi AI_PROVIDER=ANTHROPIC. Secret — không log, không export. */
  ANTHROPIC_API_KEY: z.string().default(''),
  AI_MODEL: z.string().default('claude-sonnet-5'),
  AI_BASE_URL: z.string().default('https://api.anthropic.com'),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  RETENTION_DAYS: z.coerce.number().int().positive().default(1095),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(1095),
  EXPORT_TTL_DAYS: z.coerce.number().int().positive().default(7),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Cấu hình không hợp lệ:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
