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

import { MISSING_STYLE_PREFIX, MISSING_TEMPLATE_PREFIX, SALESFORCE_VIRTUAL_PREFIX } from "./module-resolver.js";
import { ModuleLoader } from "./module-loader.js";

describe("ModuleLoader", () => {
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

  it("loads missing stylesheet modules as undefined exports", () => {
    const loader = new ModuleLoader();

    expect(
      loader.load(
        `${MISSING_STYLE_PREFIX}/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css`,
      ),
    ).toBe("export default undefined");
  });

  it("loads missing template modules by compiling an empty template", () => {
    mockExistsSync.mockImplementation((candidate) => candidate === "/repo/fixtures/sfdx-project/sfdx-project.json");
    mockCompilerTransformSync.mockReturnValue({
      code: "compiled template",
      map: null,
    });

    const loader = new ModuleLoader();
    const result = loader.load(
      `${MISSING_TEMPLATE_PREFIX}/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html`,
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
    const loader = new ModuleLoader();

    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/apex`)).toBe(
      'import { vi } from "vitest"; export const refreshApex = vi.fn(() => Promise.resolve());',
    );
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/apex/ContactController.findContacts`)).toContain(
      "createApexTestWireAdapter",
    );
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/user/Id`)).toBe('export default "005000000000000000";');
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/i18n/currency`)).toBe('export default "USD";');
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/i18n/timeZone`)).toBe('export default "timeZone";');
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/messageChannel/Foo__c`)).toBe("export default {};");
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/resourceUrl/logo`)).toBe('export default "logo";');
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/contentAssetUrl/banner`)).toBe(
      'export default "banner";',
    );
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/contentAsset/document`)).toBe(
      'export default "document";',
    );
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/customPermission/Foo`)).toBe("export default true;");
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/schema/Account.Name`)).toBe(
      'export default { objectApiName: "Account", fieldApiName: "Name" };',
    );
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/schema/Account`)).toBe(
      'export default { objectApiName: "Account" };',
    );
    expect(loader.load(`${SALESFORCE_VIRTUAL_PREFIX}@salesforce/label/c.unknown`)).toBe(
      'export default "@salesforce/label/c.unknown";',
    );
  });

  it("returns null when a missing template cannot be mapped to an sfdx project", () => {
    mockExistsSync.mockReturnValue(false);

    const loader = new ModuleLoader();

    expect(loader.load(`${MISSING_TEMPLATE_PREFIX}/repo/outside/template.html`)).toBeNull();
  });

  it("returns null for unrelated ids", () => {
    const loader = new ModuleLoader();

    expect(loader.load("/repo/src/index.ts")).toBeNull();
  });
});
