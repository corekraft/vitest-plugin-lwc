import { readFileSync } from 'node:fs';
import path from 'node:path';

import { defineConfig } from 'vitest/config';

const vitestTsconfig = JSON.parse(
  readFileSync(new URL('./tsconfig.vitest.json', import.meta.url), 'utf8'),
);
const projectRoot = path.resolve(import.meta.dirname, '..');

export default defineConfig({
  root: projectRoot,
  oxc: false,
  esbuild: {
    tsconfigRaw: vitestTsconfig,
  },
  test: {
    include: ['tests/**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**'],
    typecheck: {
      tsconfig: './tests/tsconfig.vitest.json',
    },
  },
});
