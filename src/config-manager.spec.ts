import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");

  return {
    ...actual,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
  };
});

import { ConfigManager } from "./config-manager.js";

describe("ConfigManager", () => {
  beforeEach(() => {
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();
  });

  it("builds the default vitest configuration for a project root", () => {
    const manager = new ConfigManager("/repo/project");
    const config = manager.build({});

    expect(config).toMatchObject({
      cacheDir: "node_modules/.vite",
      resolve: {
        alias: {
          lwc: "@lwc/engine-dom",
        },
      },
      test: {
        coverage: {
          provider: "v8",
          reporter: ["clover", "cobertura", "lcov", "text", "text-summary"],
        },
        environment: "jsdom",
        fileParallelism: true,
        globals: true,
        include: ["**/lwc/**/*.test.js"],
        isolate: false,
        reporters: "default",
        setupFiles: [".vitest-plugin-lwc/setup.mjs"],
      },
    });
  });

  it("merges user overrides while preserving the managed setup file", () => {
    const manager = new ConfigManager("/repo/project");
    const config = manager.build({
      cacheDir: ".cache/vite",
      resolve: {
        alias: {
          lwc: "/custom/engine-dom.js",
        },
      },
      test: {
        include: ["src/**/*.spec.ts"],
        setupFiles: ["./custom-setup.js"],
        reporters: "verbose",
      },
    });

    expect(config).toMatchObject({
      cacheDir: ".cache/vite",
      resolve: {
        alias: {
          lwc: "/custom/engine-dom.js",
        },
      },
      test: {
        include: ["src/**/*.spec.ts"],
        reporters: "verbose",
        setupFiles: [".vitest-plugin-lwc/setup.mjs", "./custom-setup.js"],
      },
    });
  });

  it("writes the managed setup module into the project root", () => {
    const manager = new ConfigManager("/repo/project");

    manager.build({});

    expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining(".vitest-plugin-lwc"), { recursive: true });
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join(".vitest-plugin-lwc", "setup.mjs")),
      expect.stringContaining("globalThis.jest = vi;"),
    );
  });

  it("accepts a string setupFiles value and preserves an existing managed setup path", () => {
    const manager = new ConfigManager("/repo/project");
    const config = manager.build({
      test: {
        setupFiles: ".vitest-plugin-lwc/setup.mjs",
      },
    });

    expect(config.test?.["setupFiles"]).toEqual([".vitest-plugin-lwc/setup.mjs"]);
  });

  it("writes a new managed setup file when building for a different root", () => {
    const manager = new ConfigManager("/repo/default");
    mockMkdirSync.mockClear();
    mockWriteFileSync.mockClear();

    const config = manager.build({
      root: "/repo/alternate",
    });

    expect(config.test?.["setupFiles"]).toEqual([".vitest-plugin-lwc/setup.mjs"]);
    expect(mockWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining(path.join("/repo/alternate", ".vitest-plugin-lwc", "setup.mjs")),
      expect.any(String),
    );
  });
});
