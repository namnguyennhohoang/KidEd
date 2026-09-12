import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');
const API_PORT = 4100;
const WEB_PORT = 3100;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // API với NODE_ENV=test -> PGlite in-memory, tự migrate + seed mỗi lần khởi động.
      command: 'npx tsx apps/api/src/index.ts',
      cwd: REPO_ROOT,
      env: { NODE_ENV: 'test', API_PORT: String(API_PORT) },
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx next dev -p ${WEB_PORT}`,
      cwd: __dirname,
      env: { API_INTERNAL_BASE: `http://localhost:${API_PORT}` },
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
