import { defineConfig } from 'drizzle-kit';

/** PGlite ở dev; migration SQL sinh ở apps/api/drizzle/. */
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  driver: 'pglite',
  dbCredentials: {
    url: process.env.PGLITE_DATA_DIR ?? './data/pglite',
  },
  strict: true,
  verbose: true,
});
