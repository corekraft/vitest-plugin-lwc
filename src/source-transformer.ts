import { createRequire } from "node:module";
import path from "node:path";

import type { TransformResult } from "vite";

import {
  MISSING_STYLE_PREFIX,
  MISSING_TEMPLATE_PREFIX,
  SALESFORCE_VIRTUAL_PREFIX,
  findSfdxProjectRoot,
} from "./module-resolver.js";

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

function getComponentName(id: string): string {
  return path.basename(path.dirname(id));
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

  rewritten = rewritten.replace(
    /vi\.mock\((['"`][^'"`]+['"`])/g,
    "__vitestPluginLwcMockedModules.add($1);\nvi.mock($1",
  );

  const needsViImport = !rewritten.includes('from "vitest"') && !rewritten.includes("from 'vitest'");
  const helperSource =
    'const __vitestPluginLwcMockedModules = globalThis.__vitestPluginLwcMockedModules ?? (globalThis.__vitestPluginLwcMockedModules = new Set());\n';

  return {
    code: needsViImport ? `import { vi } from "vitest";\n${helperSource}${rewritten}` : `${helperSource}${rewritten}`,
    map: null,
  };
}

export class SourceTransformer {
  public transform(source: string, id: string): TransformResult | null {
    if (
      id.startsWith(MISSING_STYLE_PREFIX) ||
      id.startsWith(MISSING_TEMPLATE_PREFIX) ||
      id.startsWith(SALESFORCE_VIRTUAL_PREFIX)
    ) {
      return null;
    }

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
  }
}
