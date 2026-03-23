import { beforeEach, describe, expect, it, vi } from "vitest";
const { mockExistsSync, mockCreateRequire, mockCompilerTransformSync, mockEngineResolve } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockCreateRequire: vi.fn(),
  mockCompilerTransformSync: vi.fn(),
  mockEngineResolve: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

vi.mock("node:module", () => ({
  createRequire: mockCreateRequire,
}));

import { lwc } from "./vitest-plugin-lwc.js";

function getHook<T extends (...args: any[]) => any>(hook: unknown): T {
  if (hook && typeof (hook as { handler?: unknown }).handler === "function") {
    return (hook as { handler: T }).handler;
  }

  return hook as T;
}

describe("lwc plugin unit", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockCreateRequire.mockReset();
    mockCompilerTransformSync.mockReset();
    mockEngineResolve.mockReset();

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

  it("resolves SFDX c/* component imports using the force-app convention", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
    );

    const plugin = lwc();
    const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId);
    const resolved = await resolveId!.call(
      { resolve: async () => null },
      "c/helloWorld",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      { isEntry: false },
    );

    expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js");
  });

  it("transforms LWC source files with @lwc/compiler", () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
    mockCompilerTransformSync.mockReturnValue({
      code: "compiled output",
      map: { version: 3 },
    });

    const plugin = lwc();
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

  it("returns a virtual empty stylesheet module when the compiled css file is missing", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

    const plugin = lwc();
    const resolveId = getHook<(source: string, importer?: string, options?: unknown) => unknown>(plugin.resolveId)!;
    const resolved = await resolveId.call(
      { resolve: async () => null },
      "./helloWorld.css",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
      { isEntry: false },
    );

    expect(resolved).toBe(
      "\0vitest-plugin-lwc:missing-style:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css",
    );
    const load = getHook<(id: string, options?: unknown) => unknown>(plugin.load);
    expect(load.call({}, resolved as string, { ssr: false })).toBe("export default undefined");
  });

  it("aliases lwc to the engine-dom package and forces jsdom for tests", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
    mockEngineResolve.mockReturnValue("/repo/node_modules/@lwc/engine-dom/dist/index.js");

    const plugin = lwc();
    const configHook = getHook<(config: Record<string, unknown>, env: unknown) => unknown>(plugin.config);
    const config = configHook.call(
      {},
      {
        test: {
          include: ["src/**/*.spec.ts"],
        },
      },
      { command: "serve", mode: "test" },
    );
    const resolveId = getHook(plugin.resolveId) satisfies
      | ((source: string, importer?: string, options?: unknown) => unknown)
      | undefined;
    const resolved = await resolveId!.call(
      { resolve: async () => null },
      "lwc",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      { isEntry: false },
    );

    expect(resolved).toBe("/repo/node_modules/@lwc/engine-dom/dist/index.js");
    expect(config).toMatchObject({
      test: {
        include: ["src/**/*.spec.ts"],
        environment: "jsdom",
      },
    });
  });
});
