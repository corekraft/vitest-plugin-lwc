import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export const MISSING_STYLE_PREFIX = "\0vitest-plugin-lwc:missing-style:";
export const MISSING_TEMPLATE_PREFIX = "\0vitest-plugin-lwc:missing-template:";
export const SALESFORCE_VIRTUAL_PREFIX = "\0vitest-plugin-lwc:salesforce:";

type ResolveContext = {
  resolve: (source: string, importer?: string, options?: any) => Promise<unknown>;
};

function normalizeImporterPath(importer: string): string {
  if (path.isAbsolute(importer)) {
    if (importer.startsWith(`${path.sep}force-app${path.sep}`)) {
      return path.join(process.cwd(), importer.slice(1));
    }

    return importer;
  }

  if (importer.startsWith(path.sep)) {
    return path.join(process.cwd(), importer.slice(1));
  }

  return path.resolve(importer);
}

export function findSfdxProjectRoot(start: string): string | null {
  let currentDirectory = path.dirname(normalizeImporterPath(start));

  while (currentDirectory !== path.dirname(currentDirectory)) {
    if (existsSync(path.join(currentDirectory, "sfdx-project.json"))) {
      return currentDirectory;
    }

    currentDirectory = path.dirname(currentDirectory);
  }

  return null;
}

function getPackageDirectories(projectRoot: string): string[] {
  try {
    const sfdxProject = JSON.parse(readFileSync(path.join(projectRoot, "sfdx-project.json"), "utf8")) as {
      packageDirectories?: Array<{ path?: string }>;
    };
    const packageDirectories =
      sfdxProject.packageDirectories
        ?.map((packageDirectory) => packageDirectory.path)
        .filter((packageDirectory): packageDirectory is string => typeof packageDirectory === "string" && packageDirectory.length > 0) ?? [];

    return packageDirectories.length > 0 ? packageDirectories : ["force-app"];
  } catch {
    return ["force-app"];
  }
}

function resolveLwcComponent(projectRoot: string, componentName: string): string | null {
  for (const packageDirectory of getPackageDirectories(projectRoot)) {
    const componentEntry = path.join(
      projectRoot,
      packageDirectory,
      "main",
      "default",
      "lwc",
      componentName,
      `${componentName}.js`,
    );

    if (existsSync(componentEntry)) {
      return componentEntry;
    }
  }

  return null;
}

function isStyleRequest(source: string): boolean {
  return source.endsWith(".css") || source.includes(".scoped.css?scoped=true");
}

function getMissingStyleId(source: string, importer: string): string {
  const [pathname = ""] = source.split("?");
  return `${MISSING_STYLE_PREFIX}${path.resolve(path.dirname(normalizeImporterPath(importer)), pathname)}`;
}

function isTemplateRequest(source: string): boolean {
  return source.endsWith(".html");
}

function getMissingTemplateId(source: string, importer: string): string {
  return `${MISSING_TEMPLATE_PREFIX}${path.resolve(path.dirname(normalizeImporterPath(importer)), source)}`;
}

function getProjectRequire(projectRoot: string) {
  return createRequire(path.join(projectRoot, "package.json"));
}

function getProjectMock(projectRoot: string, modulePath: string): string | null {
  for (const packageDirectory of getPackageDirectories(projectRoot)) {
    const mockPath = path.join(projectRoot, packageDirectory, "test", "jest-mocks", `${modulePath}.js`);
    if (existsSync(mockPath)) {
      return mockPath;
    }
  }

  return null;
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

export class ModuleResolver {
  public async resolve(source: string, importer: string | undefined, _context: ResolveContext): Promise<string | null> {
    void _context;

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
  }
}
