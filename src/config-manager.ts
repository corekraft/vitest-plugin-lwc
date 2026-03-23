import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type UserConfig = {
  cacheDir?: string;
  resolve?: {
    alias?: Record<string, string>;
  };
  root?: string;
  test?: Record<string, unknown>;
};

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

export class ConfigManager {
  private readonly defaultProjectRoot: string;
  private readonly defaultSetupFile: string;

  constructor(defaultProjectRoot = process.cwd()) {
    this.defaultProjectRoot = defaultProjectRoot;
    this.defaultSetupFile = ensureVitestSetupFile(defaultProjectRoot);
  }

  public build(userConfig: UserConfig): UserConfig {
    const currentResolve = userConfig.resolve;
    const currentTest = userConfig.test ?? {};
    const projectRoot = userConfig.root ?? process.cwd();
    const setupFile =
      projectRoot === this.defaultProjectRoot ? this.defaultSetupFile : ensureVitestSetupFile(projectRoot);
    const setupFiles = currentTest["setupFiles"];
    const setupFilesList = Array.isArray(setupFiles) ? setupFiles : typeof setupFiles === "string" ? [setupFiles] : [];

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
        reporters: currentTest["reporters"] ?? "default",
      },
    } satisfies UserConfig;
  }
}
