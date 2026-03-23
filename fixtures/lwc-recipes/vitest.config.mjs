import { defineConfig } from "vitest/config";
import lwc from "@corekraft/vitest-plugin-lwc";

export default defineConfig({
  plugins: [lwc()],
});
