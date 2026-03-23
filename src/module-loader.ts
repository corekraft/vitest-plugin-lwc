import { createRequire } from "node:module";
import path from "node:path";

import type { TransformResult } from "vite";

import {
  MISSING_STYLE_PREFIX,
  MISSING_TEMPLATE_PREFIX,
  SALESFORCE_VIRTUAL_PREFIX,
  findSfdxProjectRoot,
} from "./module-resolver.js";

function getComponentName(id: string): string {
  return path.basename(path.dirname(id));
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

export class ModuleLoader {
  public load(id: string): TransformResult | string | null {
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
  }
}
