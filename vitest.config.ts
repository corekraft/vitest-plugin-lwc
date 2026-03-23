import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "fixtures/**"],
    coverage: {
      provider: "v8",
      reporter: ["clover", "cobertura", "lcov", "text", "text-summary"],
    },
    typecheck: {
      tsconfig: "./tsconfig.vitest.json",
    },
  },
});
