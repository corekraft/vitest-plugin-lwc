import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Plugin, TransformResult } from "vite";

const MISSING_STYLE_PREFIX = "\0vitest-plugin-lwc:missing-style:";
const MISSING_TEMPLATE_PREFIX = "\0vitest-plugin-lwc:missing-template:";
const SALESFORCE_VIRTUAL_PREFIX = "\0vitest-plugin-lwc:salesforce:";
const GENERATED_SETUP_DIR = ".vitest-plugin-lwc";
const GENERATED_SETUP_FILE = "setup.mjs";

function getVitestSetupSource(): string {
  return `
import path from "node:path";
import { createRequire } from "node:module";
import { vi } from "vitest";

const projectRequire = createRequire(path.join(process.cwd(), "package.json"));
const missingA11yPackagesMessage =
  "Install @sa11y/preset-rules and @sa11y/matcher to use toBeAccessible().";

function resolveOptionalProjectModule(id) {
  try {
    return projectRequire.resolve(id);
  } catch {
    return null;
  }
}

const sa11yPresetPath = resolveOptionalProjectModule("@sa11y/preset-rules");
const sa11yMatcherPath = resolveOptionalProjectModule("@sa11y/matcher");
const canvasMockPath = resolveOptionalProjectModule("jest-canvas-mock");
const { defaultRuleset } = sa11yPresetPath
  ? projectRequire(sa11yPresetPath)
  : { defaultRuleset: undefined };
const { fakeTimerErrMsg, formatOptions, runA11yCheck } = sa11yMatcherPath
  ? projectRequire(sa11yMatcherPath)
  : {
      fakeTimerErrMsg: missingA11yPackagesMessage,
      formatOptions: {},
      runA11yCheck: async () => {
        throw new Error(missingA11yPackagesMessage);
      },
    };

globalThis.jest = vi;

function cleanupDom() {
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild);
  }
}

expect.extend({
  async toBeAccessible(received = document, config = defaultRuleset) {
    if (vi.isFakeTimers()) {
      throw new Error(fakeTimerErrMsg);
    }

    const { isAccessible, a11yError, receivedMsg } = await runA11yCheck(received, config);

    return {
      pass: isAccessible,
      message: () =>
        \`Expected: no accessibility violations\\nReceived: \${receivedMsg}\\n\\n\${a11yError.format({
          ...formatOptions,
          highlighter: (text) => text,
        })}\`,
    };
  },
});

afterEach(() => {
  cleanupDom();
  vi.clearAllMocks();
  vi.clearAllTimers();
});

afterAll(() => {
  vi.useRealTimers();
  vi.resetModules();
});

if (canvasMockPath) {
  await import(canvasMockPath);
}
`;
}

function ensureVitestSetupFile(projectRoot: string): string {
  const setupDir = path.join(projectRoot, GENERATED_SETUP_DIR);
  const setupPath = path.join(setupDir, GENERATED_SETUP_FILE);

  mkdirSync(setupDir, { recursive: true });
  writeFileSync(setupPath, getVitestSetupSource());

  return path.relative(projectRoot, setupPath).split(path.sep).join(path.posix.sep);
}

function findSfdxProjectRoot(start: string): string | null {
  let currentDirectory = path.dirname(start);

  while (currentDirectory !== path.dirname(currentDirectory)) {
    if (existsSync(path.join(currentDirectory, "sfdx-project.json"))) {
      return currentDirectory;
    }

    currentDirectory = path.dirname(currentDirectory);
  }

  return null;
}

function resolveLwcComponent(projectRoot: string, componentName: string): string | null {
  const componentEntry = path.join(
    projectRoot,
    "force-app",
    "main",
    "default",
    "lwc",
    componentName,
    `${componentName}.js`,
  );

  return existsSync(componentEntry) ? componentEntry : null;
}

function isLwcSourceFile(id: string): boolean {
  return (
    /\.(js|ts|html|css)$/.test(id) &&
    (id.includes(`${path.sep}lwc${path.sep}`) ||
      id.includes(`${path.sep}lightning-stubs${path.sep}`) ||
      id.includes(`${path.sep}jest-mocks${path.sep}lightning${path.sep}`))
  );
}

function isTestSourceFile(id: string): boolean {
  return /\.(test|spec)\.[jt]s$/.test(id);
}

function isStyleRequest(source: string): boolean {
  return source.endsWith(".css") || source.includes(".scoped.css?scoped=true");
}

function getMissingStyleId(source: string, importer: string): string {
  const [pathname = ""] = source.split("?");
  return `${MISSING_STYLE_PREFIX}${path.resolve(path.dirname(importer), pathname)}`;
}

function isTemplateRequest(source: string): boolean {
  return source.endsWith(".html");
}

function getMissingTemplateId(source: string, importer: string): string {
  return `${MISSING_TEMPLATE_PREFIX}${path.resolve(path.dirname(importer), source)}`;
}

function getComponentName(id: string): string {
  return path.basename(path.dirname(id));
}

function getProjectRequire(projectRoot: string) {
  return createRequire(path.join(projectRoot, "package.json"));
}

function getProjectMock(projectRoot: string, modulePath: string): string | null {
  const mockPath = path.join(projectRoot, "force-app", "test", "jest-mocks", `${modulePath}.js`);
  return existsSync(mockPath) ? mockPath : null;
}

function getLightningStub(projectRoot: string, moduleName: string): string | null {
  const projectMock = getProjectMock(projectRoot, path.join("lightning", moduleName));
  if (projectMock) {
    return projectMock;
  }

  const stubPath = path.join(
    projectRoot,
    "node_modules",
    "@salesforce",
    "sfdx-lwc-jest",
    "src",
    "lightning-stubs",
    moduleName,
    `${moduleName}.js`,
  );

  return existsSync(stubPath) ? stubPath : null;
}

function getSalesforceVirtualId(source: string): string {
  return `${SALESFORCE_VIRTUAL_PREFIX}${source}`;
}

function getSalesforceVirtualSource(id: string): string {
  return id.slice(SALESFORCE_VIRTUAL_PREFIX.length);
}

function loadSalesforceVirtualModule(source: string): string {
  if (source === "@salesforce/apex") {
    return `import { vi } from "vitest"; export const refreshApex = vi.fn(() => Promise.resolve());`;
  }

  if (source.startsWith("@salesforce/apex/")) {
    return `import { vi } from "vitest"; import { createApexTestWireAdapter } from "@salesforce/wire-service-jest-util"; export default createApexTestWireAdapter(vi.fn());`;
  }

  if (source.startsWith("@salesforce/schema/")) {
    const descriptor = source.slice("@salesforce/schema/".length);
    const [objectApiName, ...fieldParts] = descriptor.split(".");
    if (fieldParts.length === 0) {
      return `export default { objectApiName: ${JSON.stringify(objectApiName)} };`;
    }

    return `export default { objectApiName: ${JSON.stringify(objectApiName)}, fieldApiName: ${JSON.stringify(fieldParts.join("."))} };`;
  }

  if (source === "@salesforce/user/Id") {
    return `export default "005000000000000000";`;
  }

  if (source.startsWith("@salesforce/i18n/")) {
    const key = source.slice("@salesforce/i18n/".length);
    const valueByKey: Record<string, string> = {
      currency: "USD",
      locale: "en-US",
    };
    return `export default ${JSON.stringify(valueByKey[key] ?? key)};`;
  }

  if (source.startsWith("@salesforce/messageChannel/")) {
    return `export default {};`;
  }

  if (
    source.startsWith("@salesforce/resourceUrl/") ||
    source.startsWith("@salesforce/contentAssetUrl/") ||
    source.startsWith("@salesforce/contentAsset/")
  ) {
    const parts = source.split("/");
    const name = parts.at(-1) ?? "resource";
    return `export default ${JSON.stringify(name)};`;
  }

  if (source.startsWith("@salesforce/customPermission/")) {
    return `export default true;`;
  }

  return `export default ${JSON.stringify(source)};`;
}

function loadLwcCompiler(projectRoot: string) {
  const projectRequire = createRequire(path.join(projectRoot, "package.json"));
  return projectRequire("@lwc/compiler") as {
    transformSync: (
      source: string,
      filename: string,
      options: {
        name: string;
        namespace: string;
        outputConfig?: { sourcemap: boolean };
      },
    ) => { code: string; map?: unknown };
  };
}

function transformComponentSource(source: string, id: string, projectRoot: string): TransformResult {
  const compiler = loadLwcCompiler(projectRoot);
  const result = compiler.transformSync(source, id, {
    name: getComponentName(id),
    namespace: "c",
    outputConfig: {
      sourcemap: true,
    },
  });

  const map = (result.map ?? null) as TransformResult["map"];

  return {
    code: result.code,
    map,
  };
}

function transformJestMockCalls(source: string): TransformResult | null {
  if (!source.includes("jest.mock(") && !source.includes("jest.fn(") && !source.includes("jest.requireActual(")) {
    return null;
  }

  let rewritten = source.replaceAll("jest.mock(", "vi.mock(").replaceAll("jest.fn(", "vi.fn(");

  if (rewritten.includes("jest.requireActual(")) {
    rewritten = rewritten
      .replaceAll("jest.requireActual(", "await vi.importActual(")
      .replace(/vi\.mock\((['"`][^'"`]+['"`])\s*,\s*\(\)\s*=>\s*\{/g, "vi.mock($1, async () => {");
  }

  const needsViImport = !rewritten.includes('from "vitest"') && !rewritten.includes("from 'vitest'");

  return {
    code: needsViImport ? `import { vi } from "vitest";\n${rewritten}` : rewritten,
    map: null,
  };
}

export function lwc(): Plugin {
  const defaultProjectRoot = process.cwd();
  const defaultSetupFile = ensureVitestSetupFile(defaultProjectRoot);

  return {
    name: "vitest-plugin-lwc",
    config(userConfig, _env) {
      void _env;
      const configWithTest = userConfig as typeof userConfig & {
        test?: Record<string, unknown>;
        root?: string;
      };
      const currentResolve = userConfig.resolve as { alias?: Record<string, string> } | undefined;
      const currentTest = configWithTest.test ?? {};
      const projectRoot = configWithTest.root ?? process.cwd();
      const setupFile = projectRoot === defaultProjectRoot ? defaultSetupFile : ensureVitestSetupFile(projectRoot);
      const setupFiles = currentTest["setupFiles"];
      const setupFilesList = Array.isArray(setupFiles)
        ? setupFiles
        : typeof setupFiles === "string"
          ? [setupFiles]
          : [];

      return {
        ...userConfig,
        cacheDir: userConfig.cacheDir ?? process.env["VITE_CACHE_DIR"] ?? "node_modules/.vite",
        resolve: {
          ...userConfig.resolve,
          alias: {
            ...currentResolve?.alias,
            lwc: currentResolve?.alias?.["lwc"] ?? "@lwc/engine-dom",
          },
        },
        test: {
          ...currentTest,
          isolate: currentTest["isolate"] ?? false,
          fileParallelism: currentTest["fileParallelism"] ?? true,
          globals: currentTest["globals"] ?? true,
          include: currentTest["include"] ?? ["**/lwc/**/*.test.js"],
          setupFiles: setupFilesList.includes(setupFile) ? setupFilesList : [setupFile, ...setupFilesList],
          coverage: {
            provider: "v8",
            reporter: ["clover", "cobertura", "lcov", "text", "text-summary"],
            ...(currentTest["coverage"] as Record<string, unknown> | undefined),
          },
          environment: currentTest["environment"] ?? "jsdom",
          reporters: currentTest["reporters"] ?? "dot",
        },
      };
    },
    async resolveId(source, importer) {
      if (importer && source.startsWith("./") && isStyleRequest(source)) {
        const styleId = getMissingStyleId(source, importer);
        const missingStylePath = styleId.slice(MISSING_STYLE_PREFIX.length);

        return existsSync(missingStylePath) ? null : styleId;
      }

      if (importer && source.startsWith("./") && isTemplateRequest(source)) {
        const templateId = getMissingTemplateId(source, importer);
        const missingTemplatePath = templateId.slice(MISSING_TEMPLATE_PREFIX.length);

        return existsSync(missingTemplatePath) ? null : templateId;
      }

      if (source === "lwc") {
        const projectRoot = importer ? findSfdxProjectRoot(importer) : null;
        if (!projectRoot) {
          return null;
        }

        const projectRequire = getProjectRequire(projectRoot);
        return projectRequire.resolve("@lwc/engine-dom");
      }

      if (source.startsWith("lightning/")) {
        const projectRoot = importer ? findSfdxProjectRoot(importer) : null;
        if (!projectRoot) {
          return null;
        }

        return getLightningStub(projectRoot, source.slice("lightning/".length));
      }

      if (source === "@salesforce/apex" || source === "@salesforce/schema") {
        const projectRoot = importer ? findSfdxProjectRoot(importer) : null;
        if (!projectRoot) {
          return null;
        }

        return getProjectMock(projectRoot, source.replace("@salesforce/", "")) ?? getSalesforceVirtualId(source);
      }

      if (source.startsWith("@salesforce/")) {
        return getSalesforceVirtualId(source);
      }

      if (!source.startsWith("c/") || !importer) {
        return null;
      }

      const projectRoot = findSfdxProjectRoot(importer);
      if (!projectRoot) {
        return null;
      }

      return resolveLwcComponent(projectRoot, source.slice(2));
    },
    load(id) {
      if (id.startsWith(SALESFORCE_VIRTUAL_PREFIX)) {
        return loadSalesforceVirtualModule(getSalesforceVirtualSource(id));
      }

      if (id.startsWith(MISSING_TEMPLATE_PREFIX)) {
        const templatePath = id.slice(MISSING_TEMPLATE_PREFIX.length);
        const projectRoot = findSfdxProjectRoot(templatePath);
        if (!projectRoot) {
          return null;
        }

        return transformComponentSource("<template></template>", templatePath, projectRoot);
      }

      if (!id.startsWith(MISSING_STYLE_PREFIX)) {
        return null;
      }

      return "export default undefined";
    },
    transform(source, id) {
      if (isTestSourceFile(id)) {
        return transformJestMockCalls(source);
      }

      if (!isLwcSourceFile(id)) {
        return null;
      }

      const projectRoot = findSfdxProjectRoot(id);
      if (!projectRoot) {
        return null;
      }

      return transformComponentSource(source, id, projectRoot);
    },
  };
}
