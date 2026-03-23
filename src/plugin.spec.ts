import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync, mockCreateRequire, mockCompilerTransformSync, mockEngineResolve } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockCreateRequire: vi.fn(),
  mockCompilerTransformSync: vi.fn(),
  mockEngineResolve: vi.fn(),
}));
const mockMkdirSync = vi.hoisted(() => vi.fn());
const mockWriteFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}));

vi.mock("node:module", () => ({
  createRequire: mockCreateRequire,
}));

import { lwc } from "./plugin.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- type caster
function getHook<T extends (...args: any[]) => any>(hook: unknown): T {
  if (hook && typeof (hook as { handler?: unknown }).handler === "function") {
    return (hook as { handler: T }).handler;
  }

  return hook as T;
}

function createPlugin() {
  return lwc();
}

function createResolveContext() {
  return {
    resolve: async () => null,
  };
}

describe("lwc plugin unit", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockCreateRequire.mockReset();
    mockCompilerTransformSync.mockReset();
    mockEngineResolve.mockReset();
    mockMkdirSync.mockReset();
    mockWriteFileSync.mockReset();

    mockCreateRequire.mockImplementation(() => {
      const projectRequire = ((id: string) => {
        if (id === "@lwc/compiler") {
          return {
            transformSync: mockCompilerTransformSync,
          };
        }

        throw new Error(`Unexpected require: ${id}`);
      }) as ((id: string) => unknown) & { resolve: typeof mockEngineResolve };

      projectRequire.resolve = mockEngineResolve;
      return projectRequire;
    });
  });

  describe("config", () => {
    it("applies the default vitest configuration", () => {
      const plugin = createPlugin();
      const configHook = getHook<(config: Record<string, unknown>, env: unknown) => Record<string, unknown>>(
        plugin.config,
      );
      const config = configHook.call({}, {}, { command: "serve", mode: "test" });

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

    it("merges user configuration without overwriting managed setup defaults", () => {
      const plugin = createPlugin();
      const configHook = getHook<(config: Record<string, unknown>, env: unknown) => Record<string, unknown>>(
        plugin.config,
      );
      const config = configHook.call(
        {},
        {
          cacheDir: ".cache/vite",
          resolve: {
            alias: {
              lwc: "/custom/engine-dom.js",
            },
          },
          test: {
            environment: "happy-dom",
            include: ["src/**/*.spec.ts"],
            setupFiles: ["./custom-setup.js"],
            coverage: {
              reporter: ["json"],
            },
            reporters: "verbose",
          },
        },
        { command: "serve", mode: "test" },
      );

      expect(config).toMatchObject({
        cacheDir: ".cache/vite",
        resolve: {
          alias: {
            lwc: "/custom/engine-dom.js",
          },
        },
        test: {
          coverage: {
            provider: "v8",
            reporter: ["json"],
          },
          environment: "happy-dom",
          include: ["src/**/*.spec.ts"],
          reporters: "verbose",
          setupFiles: [".vitest-plugin-lwc/setup.mjs", "./custom-setup.js"],
        },
      });
    });

    it("writes the managed setup module into the project root", () => {
      const plugin = createPlugin();
      const configHook = getHook<(config: Record<string, unknown>, env: unknown) => Record<string, unknown>>(
        plugin.config,
      );

      configHook.call({}, {}, { command: "serve", mode: "test" });

      expect(mockMkdirSync).toHaveBeenCalledWith(expect.stringContaining(".vitest-plugin-lwc"), { recursive: true });
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining(path.join(".vitest-plugin-lwc", "setup.mjs")),
        expect.stringContaining("globalThis.jest = vi;"),
      );
    });
  });

  describe("resolveId", () => {
    it("resolves c/* component imports from force-app/main/default/lwc", async () => {
      mockExistsSync.mockImplementation(
        (candidate) =>
          candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
          candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      );

      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(
        createResolveContext(),
        "c/helloWorld",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
        { isEntry: false },
      );

      expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js");
    });

    it("resolves lwc to the project engine-dom package", async () => {
      mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
      mockEngineResolve.mockReturnValue("/repo/node_modules/@lwc/engine-dom/dist/index.js");

      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(
        createResolveContext(),
        "lwc",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        { isEntry: false },
      );

      expect(resolved).toBe("/repo/node_modules/@lwc/engine-dom/dist/index.js");
    });

    it("prefers project lightning mocks over built-in stubs", async () => {
      mockExistsSync.mockImplementation(
        (candidate) =>
          candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
          candidate === "/repo/fixtures/sfdx-project/force-app/test/jest-mocks/lightning/navigation.js",
      );

      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(
        createResolveContext(),
        "lightning/navigation",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        { isEntry: false },
      );

      expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/test/jest-mocks/lightning/navigation.js");
    });

    it("returns a virtual id for missing component stylesheets", async () => {
      mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(
        createResolveContext(),
        "./helloWorld.css",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
        { isEntry: false },
      );

      expect(resolved).toBe(
        "\0vitest-plugin-lwc:missing-style:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css",
      );
    });

    it("returns a virtual id for missing component templates", async () => {
      mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(
        createResolveContext(),
        "./helloWorld.html",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        { isEntry: false },
      );

      expect(resolved).toBe(
        "\0vitest-plugin-lwc:missing-template:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
      );
    });

    it("returns a salesforce virtual id for framework modules", async () => {
      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(
        createResolveContext(),
        "@salesforce/user/Id",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        { isEntry: false },
      );

      expect(resolved).toBe("\0vitest-plugin-lwc:salesforce:@salesforce/user/Id");
    });

    it("returns null for c/* imports outside an sfdx project", async () => {
      mockExistsSync.mockReturnValue(false);

      const plugin = createPlugin();
      const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
      const resolved = await resolveId.call(createResolveContext(), "c/helloWorld", "/repo/src/index.ts", {
        isEntry: false,
      });

      expect(resolved).toBeNull();
    });
  });

  describe("load", () => {
    it("loads missing stylesheet modules as undefined exports", () => {
      const plugin = createPlugin();
      const load = getHook<(id: string, options?: unknown) => unknown>(plugin.load);

      expect(
        load.call(
          {},
          "\0vitest-plugin-lwc:missing-style:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css",
          { ssr: false },
        ),
      ).toBe("export default undefined");
    });

    it("loads missing template modules by compiling an empty template", () => {
      mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
      mockCompilerTransformSync.mockReturnValue({
        code: "compiled template",
        map: null,
      });

      const plugin = createPlugin();
      const load = getHook<(id: string, options?: unknown) => unknown>(plugin.load);
      const result = load.call(
        {},
        "\0vitest-plugin-lwc:missing-template:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
        { ssr: false },
      );

      expect(mockCompilerTransformSync).toHaveBeenCalledWith(
        "<template></template>",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
        expect.objectContaining({
          name: "helloWorld",
          namespace: "c",
        }),
      );
      expect(result).toEqual({
        code: "compiled template",
        map: null,
      });
    });

    it("loads virtual salesforce modules with the correct shim source", () => {
      const plugin = createPlugin();
      const load = getHook<(id: string, options?: unknown) => unknown>(plugin.load);

      expect(load.call({}, "\0vitest-plugin-lwc:salesforce:@salesforce/user/Id", { ssr: false })).toBe(
        'export default "005000000000000000";',
      );
      expect(load.call({}, "\0vitest-plugin-lwc:salesforce:@salesforce/customPermission/Foo", { ssr: false })).toBe(
        "export default true;",
      );
      expect(load.call({}, "\0vitest-plugin-lwc:salesforce:@salesforce/schema/Account.Name", { ssr: false })).toBe(
        'export default { objectApiName: "Account", fieldApiName: "Name" };',
      );
    });
  });

  describe("transform", () => {
    it("transforms lwc component source with @lwc/compiler", () => {
      mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
      mockCompilerTransformSync.mockReturnValue({
        code: "compiled output",
        map: { version: 3 },
      });

      const plugin = createPlugin();
      const transform = getHook<(code: string, id: string, options?: unknown) => unknown>(plugin.transform);
      const result = transform.call(
        {},
        "export default class HelloWorld {}",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      );

      expect(mockCompilerTransformSync).toHaveBeenCalledWith(
        "export default class HelloWorld {}",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        {
          name: "helloWorld",
          namespace: "c",
          outputConfig: {
            sourcemap: true,
          },
        },
      );
      expect(result).toEqual({
        code: "compiled output",
        map: { version: 3 },
      });
    });

    it("rewrites jest helpers in test files to vi helpers", () => {
      const plugin = createPlugin();
      const transform = getHook<(code: string, id: string, options?: unknown) => unknown>(plugin.transform);
      const result = transform.call(
        {},
        'jest.mock("foo", () => ({ value: jest.fn(), actual: jest.requireActual("foo") }));',
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      ) as { code: string; map: null };

      expect(result.code).toContain('import { vi } from "vitest";');
      expect(result.code).toContain(
        'vi.mock("foo", () => ({ value: vi.fn(), actual: await vi.importActual("foo") }));',
      );
      expect(result.code).toContain('await vi.importActual("foo")');
      expect(result.map).toBeNull();
    });

    it("returns null for files outside lwc and test patterns", () => {
      const plugin = createPlugin();
      const transform = getHook<(code: string, id: string, options?: unknown) => unknown>(plugin.transform);

      expect(transform.call({}, "export const value = 1;", "/repo/src/index.ts")).toBeNull();
    });
  });
});
