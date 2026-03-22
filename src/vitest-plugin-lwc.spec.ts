import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockExistsSync,
  mockCreateRequire,
  mockCompilerTransformSync,
  mockEngineResolve,
} = vi.hoisted(() => ({
  mockExistsSync: vi.fn<(path: string) => boolean>(),
  mockCreateRequire: vi.fn(),
  mockCompilerTransformSync: vi.fn(),
  mockEngineResolve: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: mockExistsSync,
}));

vi.mock('node:module', () => ({
  createRequire: mockCreateRequire,
}));

import { lwc } from './vitest-plugin-lwc.js';

describe('lwc plugin unit', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockCreateRequire.mockReset();
    mockCompilerTransformSync.mockReset();
    mockEngineResolve.mockReset();

    mockCreateRequire.mockImplementation(() => {
      const projectRequire = ((id: string) => {
        if (id === '@lwc/compiler') {
          return {
            transformSync: mockCompilerTransformSync,
          };
        }

        throw new Error(`Unexpected require: ${id}`);
      }) as ((id: string) => unknown) & { resolve: typeof mockEngineResolve };

      projectRequire.resolve = mockEngineResolve;
      return projectRequire;
    });
  });

  it('resolves SFDX c/* component imports using the force-app convention', async () => {
    mockExistsSync.mockImplementation((candidate) =>
      candidate === '/repo/fixtures/sfdx-project/sfdx-project.json'
        || candidate
          === '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js',
    );

    const plugin = lwc();
    const resolved = await plugin.resolveId?.call(
      { resolve: async () => null },
      'c/helloWorld',
      '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js',
    );

    expect(resolved).toBe(
      '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js',
    );
  });

  it('transforms LWC source files with @lwc/compiler', () => {
    mockExistsSync.mockImplementation(
      (candidate) => candidate === '/repo/fixtures/sfdx-project/sfdx-project.json',
    );
    mockCompilerTransformSync.mockReturnValue({
      code: 'compiled output',
      map: { version: 3 },
    });

    const plugin = lwc();
    const result = plugin.transform?.(
      'export default class HelloWorld {}',
      '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js',
    );

    expect(mockCompilerTransformSync).toHaveBeenCalledWith(
      'export default class HelloWorld {}',
      '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js',
      {
        name: 'helloWorld',
        namespace: 'c',
        outputConfig: {
          sourcemap: true,
        },
      },
    );
    expect(result).toEqual({
      code: 'compiled output',
      map: { version: 3 },
    });
  });

  it('returns a virtual empty stylesheet module when the compiled css file is missing', async () => {
    mockExistsSync.mockImplementation(
      (candidate) => candidate === '/repo/fixtures/sfdx-project/sfdx-project.json',
    );

    const plugin = lwc();
    const resolved = await plugin.resolveId?.call(
      { resolve: async () => null },
      './helloWorld.css',
      '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html',
    );

    expect(resolved).toBe(
      '\0vitest-plugin-lwc:missing-style:/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css',
    );
    expect(plugin.load?.(resolved as string)).toBe('export default undefined');
  });

  it('aliases lwc to the engine-dom package and forces jsdom for tests', async () => {
    mockExistsSync.mockImplementation(
      (candidate) => candidate === '/repo/fixtures/sfdx-project/sfdx-project.json',
    );
    mockEngineResolve.mockReturnValue('/repo/node_modules/@lwc/engine-dom/dist/index.js');

    const plugin = lwc();
    const config = plugin.config?.(
      {
        test: {
          include: ['src/**/*.spec.ts'],
        },
      },
      { command: 'serve', mode: 'test' },
    );
    const resolved = await plugin.resolveId?.call(
      { resolve: async () => null },
      'lwc',
      '/repo/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js',
    );

    expect(resolved).toBe('/repo/node_modules/@lwc/engine-dom/dist/index.js');
    expect(config).toMatchObject({
      test: {
        include: ['src/**/*.spec.ts'],
        environment: 'jsdom',
      },
    });
  });
});
