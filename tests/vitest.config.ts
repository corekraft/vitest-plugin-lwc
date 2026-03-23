import path from "node:path";

import { defineConfig } from "vitest/config";

const projectRoot = path.resolve(import.meta.dirname, "..");

export default defineConfig({
  root: projectRoot,
  oxc: false,
  test: {
    include: ["tests/**/*.e2e-spec.ts"],
    exclude: ["**/node_modules/**"],
    typecheck: {
      tsconfig: "./tests/tsconfig.vitest.json",
    },
  },
});
