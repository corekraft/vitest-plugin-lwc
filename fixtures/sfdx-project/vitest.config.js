import { defineConfig } from "vitest/config";
import { lwc } from "@corekraft/vitest-plugin-lwc";

export default defineConfig({
  plugins: [lwc()],
  test: {
    include: ["**/lwc/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["clover", "cobertura", "lcov", "text", "text-summary"]
    }
  }
});
