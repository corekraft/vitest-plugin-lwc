import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync, mockReadFileSync, mockCreateRequire, mockEngineResolve } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockReadFileSync: vi.fn<(path: string) => string>(),
  mockCreateRequire: vi.fn(),
  mockEngineResolve: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

vi.mock("node:module", () => ({
  createRequire: mockCreateRequire,
}));

import { ModuleResolver } from "./module-resolver.js";

function createResolveContext() {
  return {
    resolve: async () => null,
  };
}

describe("ModuleResolver", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockReadFileSync.mockReset();
    mockCreateRequire.mockReset();
    mockEngineResolve.mockReset();

    mockReadFileSync.mockImplementation((candidate) => {
      if (candidate === "/repo/fixtures/sfdx-project/sfdx-project.json") {
        return JSON.stringify({
          packageDirectories: [{ path: "force-app", default: true }],
        });
      }

      throw new Error(`Unexpected read: ${candidate}`);
    });

    mockCreateRequire.mockImplementation(() => {
      const projectRequire = ((id: string) => {
        throw new Error(`Unexpected require: ${id}`);
      }) as unknown as ((id: string) => unknown) & { resolve: typeof mockEngineResolve };

      projectRequire.resolve = mockEngineResolve;
      return projectRequire;
    });
  });

  it("resolves c/* component imports from force-app/main/default/lwc", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
    );

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "c/helloWorld",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      createResolveContext(),
    );

    expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js");
  });

  it("resolves c/* component imports when the importer path is relative", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo/fixtures/sfdx-project");
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
    );

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "c/helloWorld",
      "force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      createResolveContext(),
    );

    expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js");

    cwdSpy.mockRestore();
  });

  it("resolves c/* component imports when the importer path is root-relative", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo/fixtures/sfdx-project");
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
    );

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "c/helloWorld",
      "/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      createResolveContext(),
    );

    expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js");

    cwdSpy.mockRestore();
  });

  it("resolves c/* component imports from a package directory declared in sfdx-project.json", async () => {
    mockReadFileSync.mockImplementation((candidate) => {
      if (candidate === "/repo/fixtures/sfdx-project/sfdx-project.json") {
        return JSON.stringify({
          packageDirectories: [{ path: "packages/ui" }],
        });
      }

      throw new Error(`Unexpected read: ${candidate}`);
    });
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/packages/ui/main/default/lwc/helloWorld/helloWorld.js",
    );

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "c/helloWorld",
      "/repo/fixtures/sfdx-project/packages/ui/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      createResolveContext(),
    );

    expect(resolved).toBe("/repo/fixtures/sfdx-project/packages/ui/main/default/lwc/helloWorld/helloWorld.js");
  });

  it("resolves lwc to the project engine-dom package", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
    mockEngineResolve.mockReturnValue("/repo/node_modules/@lwc/engine-dom/dist/index.js");

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "lwc",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      createResolveContext(),
    );

    expect(resolved).toBe("/repo/node_modules/@lwc/engine-dom/dist/index.js");
  });

  it("prefers project lightning mocks over built-in stubs", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/test/jest-mocks/lightning/navigation.js",
    );

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "lightning/navigation",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      createResolveContext(),
    );

    expect(resolved).toBe("/repo/fixtures/sfdx-project/force-app/test/jest-mocks/lightning/navigation.js");
  });

  it("falls back to built-in lightning stubs when no project mock exists", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate ===
          "/repo/fixtures/sfdx-project/node_modules/@salesforce/sfdx-lwc-jest/src/lightning-stubs/navigation/navigation.js",
    );

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "lightning/navigation",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      createResolveContext(),
    );

    expect(resolved).toBe(
      "/repo/fixtures/sfdx-project/node_modules/@salesforce/sfdx-lwc-jest/src/lightning-stubs/navigation/navigation.js",
    );
  });

  it("returns a virtual id for missing component stylesheets", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "./helloWorld.css",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
      createResolveContext(),
    );

    expect(resolved).toBe(
      "\0vitest-plugin-lwc:missing-style:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css",
    );
  });

  it("returns null for component stylesheets that already exist", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css",
    );

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "./helloWorld.css",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
        createResolveContext(),
      ),
    ).resolves.toBeNull();
  });

  it("returns a virtual id for missing component templates", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "./helloWorld.html",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      createResolveContext(),
    );

    expect(resolved).toBe(
      "\0vitest-plugin-lwc:missing-template:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
    );
  });

  it("returns null for component templates that already exist", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html",
    );

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "./helloWorld.html",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBeNull();
  });

  it("returns null for component templates that already exist with a root-relative importer", async () => {
    const cwdSpy = vi.spyOn(process, "cwd").mockReturnValue("/repo/fixtures/sfdx-project");
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld",
    );

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "./helloWorld.html",
        "/force-app/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBeNull();

    cwdSpy.mockRestore();
  });

  it("returns a salesforce virtual id for framework modules", async () => {
    const resolver = new ModuleResolver();
    const resolved = await resolver.resolve(
      "@salesforce/user/Id",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
      createResolveContext(),
    );

    expect(resolved).toBe("\0vitest-plugin-lwc:salesforce:@salesforce/user/Id");
  });

  it("returns null for lightning imports outside an sfdx project", async () => {
    mockExistsSync.mockReturnValue(false);

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve("lightning/navigation", "/repo/src/component.js", createResolveContext()),
    ).resolves.toBeNull();
  });

  it("returns null for lwc imports without an importer", async () => {
    const resolver = new ModuleResolver();

    await expect(resolver.resolve("lwc", undefined, createResolveContext())).resolves.toBeNull();
  });

  it("resolves apex and schema mocks from the project when available", async () => {
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/test/jest-mocks/apex.js" ||
        candidate === "/repo/fixtures/sfdx-project/force-app/test/jest-mocks/schema.js",
    );

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "@salesforce/apex",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBe("/repo/fixtures/sfdx-project/force-app/test/jest-mocks/apex.js");

    await expect(
      resolver.resolve(
        "@salesforce/schema",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBe("/repo/fixtures/sfdx-project/force-app/test/jest-mocks/schema.js");
  });

  it("resolves apex and schema mocks from a package directory declared in sfdx-project.json", async () => {
    mockReadFileSync.mockImplementation((candidate) => {
      if (candidate === "/repo/fixtures/sfdx-project/sfdx-project.json") {
        return JSON.stringify({
          packageDirectories: [{ path: "packages/ui" }],
        });
      }

      throw new Error(`Unexpected read: ${candidate}`);
    });
    mockExistsSync.mockImplementation(
      (candidate) =>
        candidate === "/repo/fixtures/sfdx-project/sfdx-project.json" ||
        candidate === "/repo/fixtures/sfdx-project/packages/ui/test/jest-mocks/apex.js" ||
        candidate === "/repo/fixtures/sfdx-project/packages/ui/test/jest-mocks/schema.js",
    );

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "@salesforce/apex",
        "/repo/fixtures/sfdx-project/packages/ui/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBe("/repo/fixtures/sfdx-project/packages/ui/test/jest-mocks/apex.js");

    await expect(
      resolver.resolve(
        "@salesforce/schema",
        "/repo/fixtures/sfdx-project/packages/ui/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBe("/repo/fixtures/sfdx-project/packages/ui/test/jest-mocks/schema.js");
  });

  it("falls back to a virtual id for apex and schema when no project mock exists", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "@salesforce/apex",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBe("\0vitest-plugin-lwc:salesforce:@salesforce/apex");

    await expect(
      resolver.resolve(
        "@salesforce/schema",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
        createResolveContext(),
      ),
    ).resolves.toBe("\0vitest-plugin-lwc:salesforce:@salesforce/schema");
  });

  it("returns null for apex and schema imports outside an sfdx project", async () => {
    mockExistsSync.mockReturnValue(false);

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve("@salesforce/apex", "/repo/src/component.js", createResolveContext()),
    ).resolves.toBeNull();
    await expect(
      resolver.resolve("@salesforce/schema", "/repo/src/component.js", createResolveContext()),
    ).resolves.toBeNull();
  });

  it("returns null for apex and schema imports without an importer", async () => {
    const resolver = new ModuleResolver();

    await expect(resolver.resolve("@salesforce/apex", undefined, createResolveContext())).resolves.toBeNull();
    await expect(resolver.resolve("@salesforce/schema", undefined, createResolveContext())).resolves.toBeNull();
  });

  it("returns null for non-c imports and for c imports without an importer", async () => {
    const resolver = new ModuleResolver();

    await expect(resolver.resolve("foo", "/repo/src/component.js", createResolveContext())).resolves.toBeNull();
    await expect(resolver.resolve("c/helloWorld", undefined, createResolveContext())).resolves.toBeNull();
  });

  it("returns null for c/* imports when the component entry does not exist", async () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");

    const resolver = new ModuleResolver();

    await expect(
      resolver.resolve(
        "c/helloWorld",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
        createResolveContext(),
      ),
    ).resolves.toBeNull();
  });
});
