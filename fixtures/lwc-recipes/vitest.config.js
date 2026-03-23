import { createRequire } from "node:module";
import { defineConfig } from "vitest/config";
import lwc from "@corekraft/vitest-plugin-lwc";

const require = createRequire(import.meta.url);

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR ?? "node_modules/.vite",
  plugins: [lwc()],
  test: {
    isolate: false,
    fileParallelism: true,
    globals: true,
    include: ["**/lwc/**/*.test.js"],
    setupFiles: ["./vitest.setup.js"],
    coverage: {
      provider: "v8",
      reporter: ["clover", "cobertura", "lcov", "text", "text-summary"]
    }
  },
  resolve: {
    alias: {
      lwc: require.resolve("@lwc/engine-dom")
    }
  }
});
