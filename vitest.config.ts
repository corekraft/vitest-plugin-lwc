import { readFileSync } from 'node:fs';

import { defineConfig } from 'vitest/config';

const vitestTsconfig = JSON.parse(
  readFileSync(new URL('./tsconfig.vitest.json', import.meta.url), 'utf8'),
);

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    exclude: ['**/node_modules/**', 'fixtures/**'],
    coverage: {
      provider: 'v8',
      reporter: ['clover', 'cobertura', 'lcov', 'text', 'text-summary'],
    },
    typecheck: {
      tsconfig: './tsconfig.vitest.json',
    },
  },
});
