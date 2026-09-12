import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'data/**',
      'apps/api/drizzle/**',
      'apps/web/e2e/**',
      'apps/web/playwright.config.ts',
      'apps/web/next.config.mjs',
      'apps/web/postcss.config.mjs',
      'apps/web/public/**',
      '**/next-env.d.ts',
      'packages/content-schema/validate.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
