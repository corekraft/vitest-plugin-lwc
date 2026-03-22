import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import type { Plugin, TransformResult } from 'vite';

const MISSING_STYLE_PREFIX = '\0vitest-plugin-lwc:missing-style:';

function findSfdxProjectRoot(start: string): string | null {
  let currentDirectory = path.dirname(start);

  while (currentDirectory !== path.dirname(currentDirectory)) {
    if (existsSync(path.join(currentDirectory, 'sfdx-project.json'))) {
      return currentDirectory;
    }

    currentDirectory = path.dirname(currentDirectory);
  }

  return null;
}

function resolveLwcComponent(
  projectRoot: string,
  componentName: string,
): string | null {
  const componentEntry = path.join(
    projectRoot,
    'force-app',
    'main',
    'default',
    'lwc',
    componentName,
    `${componentName}.js`,
  );

  return existsSync(componentEntry) ? componentEntry : null;
}

function isLwcSourceFile(id: string): boolean {
  return (
    /\.(js|ts|html|css)$/.test(id) && id.includes(`${path.sep}lwc${path.sep}`)
  );
}

function isStyleRequest(source: string): boolean {
  return source.endsWith('.css') || source.includes('.scoped.css?scoped=true');
}

function getMissingStyleId(source: string, importer: string): string {
  const [pathname = ''] = source.split('?');
  return `${MISSING_STYLE_PREFIX}${path.resolve(path.dirname(importer), pathname)}`;
}

function getComponentName(id: string): string {
  return path.basename(path.dirname(id));
}

function loadLwcCompiler(projectRoot: string) {
  const projectRequire = createRequire(path.join(projectRoot, 'package.json'));
  return projectRequire('@lwc/compiler') as {
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

function transformComponentSource(
  source: string,
  id: string,
  projectRoot: string,
): TransformResult {
  const compiler = loadLwcCompiler(projectRoot);
  const result = compiler.transformSync(source, id, {
    name: getComponentName(id),
    namespace: 'c',
    outputConfig: {
      sourcemap: true,
    },
  });

  const map = (result.map ?? null) as TransformResult['map'];

  return {
    code: result.code,
    map,
  };
}

export function lwc(): Plugin {
  return {
    name: 'vitest-plugin-lwc',
    config(userConfig, _env) {
      void _env;
      const configWithTest = userConfig as typeof userConfig & {
        test?: Record<string, unknown>;
      };

      return {
        ...userConfig,
        test: {
          ...configWithTest.test,
          environment: 'jsdom',
        },
      };
    },
    async resolveId(source, importer) {
      if (importer && source.startsWith('./') && isStyleRequest(source)) {
        const styleId = getMissingStyleId(source, importer);
        const missingStylePath = styleId.slice(MISSING_STYLE_PREFIX.length);

        return existsSync(missingStylePath) ? null : styleId;
      }

      if (source === 'lwc') {
        const projectRoot = importer ? findSfdxProjectRoot(importer) : null;
        if (!projectRoot) {
          return null;
        }

        const projectRequire = createRequire(
          path.join(projectRoot, 'package.json'),
        );
        return projectRequire.resolve('@lwc/engine-dom');
      }

      if (!source.startsWith('c/') || !importer) {
        return null;
      }

      const projectRoot = findSfdxProjectRoot(importer);
      if (!projectRoot) {
        return null;
      }

      return resolveLwcComponent(projectRoot, source.slice(2));
    },
    load(id) {
      if (!id.startsWith(MISSING_STYLE_PREFIX)) {
        return null;
      }

      return 'export default undefined';
    },
    transform(source, id) {
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

export const plugin = lwc;
