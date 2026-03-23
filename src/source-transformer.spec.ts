import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExistsSync, mockCreateRequire, mockCompilerTransformSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockCreateRequire: vi.fn(),
  mockCompilerTransformSync: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

vi.mock("node:module", () => ({
  createRequire: mockCreateRequire,
}));

import { MISSING_TEMPLATE_PREFIX } from "./module-resolver.js";
import { SourceTransformer } from "./source-transformer.js";

describe("SourceTransformer", () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockCreateRequire.mockReset();
    mockCompilerTransformSync.mockReset();

    mockCreateRequire.mockImplementation(() => {
      return ((id: string) => {
        if (id === "@lwc/compiler") {
          return {
            transformSync: mockCompilerTransformSync,
          };
        }

        throw new Error(`Unexpected require: ${id}`);
      }) as unknown as ((id: string) => unknown) & { resolve: (id: string) => string };
    });
  });

  it("transforms lwc component source with @lwc/compiler", () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
    mockCompilerTransformSync.mockReturnValue({
      code: "compiled output",
      map: { version: 3 },
    });

    const transformer = new SourceTransformer();
    const result = transformer.transform(
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

  it("normalizes missing compiler sourcemaps to null", () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
    mockCompilerTransformSync.mockReturnValue({
      code: "compiled output",
    });

    const transformer = new SourceTransformer();
    const result = transformer.transform(
      "export default class HelloWorld {}",
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js",
    );

    expect(result).toEqual({
      code: "compiled output",
      map: null,
    });
  });

  it("rewrites jest helpers in test files to vi helpers", () => {
    const transformer = new SourceTransformer();
    const result = transformer.transform(
      'jest.mock("foo", () => ({ value: jest.fn(), actual: jest.requireActual("foo") }));',
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
    ) as { code: string; map: null };

    expect(result.code).toContain('import { vi } from "vitest";');
    expect(result.code).toContain('vi.mock("foo", () => ({ value: vi.fn(), actual: await vi.importActual("foo") }));');
    expect(result.code).toContain('await vi.importActual("foo")');
    expect(result.map).toBeNull();
  });

  it("returns null for unrelated source files", () => {
    const transformer = new SourceTransformer();

    expect(transformer.transform("export const value = 1;", "/repo/src/index.ts")).toBeNull();
  });

  it("returns null for plugin virtual module ids", () => {
    const transformer = new SourceTransformer();

    expect(
      transformer.transform('export default registerTemplate(tmpl);', `${MISSING_TEMPLATE_PREFIX}/repo/lwc/foo/foo.html`),
    ).toBeNull();
  });

  it("returns null for test files that do not use jest helpers", () => {
    const transformer = new SourceTransformer();

    expect(
      transformer.transform(
        "import { describe, it, expect } from 'vitest';",
        "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
      ),
    ).toBeNull();
  });

  it("does not inject a vitest import when one already exists", () => {
    const transformer = new SourceTransformer();
    const result = transformer.transform(
      'import { vi } from "vitest";\njest.fn();',
      "/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js",
    ) as { code: string };

    expect(result.code.match(/import \{ vi \} from "vitest";/g)).toHaveLength(1);
  });

  it("returns null for lwc source when no sfdx project root can be found", () => {
    mockExistsSync.mockReturnValue(false);

    const transformer = new SourceTransformer();

    expect(
      transformer.transform("export default class HelloWorld {}", "/repo/outside/lwc/helloWorld/helloWorld.js"),
    ).toBeNull();
  });
});
