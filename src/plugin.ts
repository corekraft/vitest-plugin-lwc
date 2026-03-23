import type { Plugin } from "vite";
import { ConfigManager } from "./config-manager.js";
import { ModuleLoader } from "./module-loader.js";
import { ModuleResolver } from "./module-resolver.js";
import { SourceTransformer } from "./source-transformer.js";

export function lwc(): Plugin {
  const configManager = new ConfigManager();
  const moduleLoader = new ModuleLoader();
  const moduleResolver = new ModuleResolver();
  const sourceTransformer = new SourceTransformer();

  return {
    name: "vitest-plugin-lwc",
    config(userConfig, _env) {
      void _env;
      return configManager.build(userConfig as Parameters<ConfigManager["build"]>[0]);
    },
    async resolveId(source, importer) {
      return moduleResolver.resolve(source, importer, this);
    },
    load(id) {
      return moduleLoader.load(id);
    },
    transform(source, id) {
      return sourceTransformer.transform(source, id);
    },
  };
}
