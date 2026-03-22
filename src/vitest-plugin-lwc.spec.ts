import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { lwc } from './vitest-plugin-lwc.js';

describe('lwc plugin', () => {
  it('resolves SFDX c/* component imports to the component JavaScript file', async () => {
    const plugin = lwc();
    const resolved = await plugin.resolveId!.call(
      {
        resolve: async () => null,
      },
      'c/helloWorld',
      './fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/__tests__/helloWorld.test.js',
    );

    expect(resolved).toBe(
      'fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js',
    );
  });

  it('transforms an LWC component with @lwc/compiler', async () => {
    const plugin = lwc();
    const componentPath =
      '/Users/jun/Development/github/vitest-plugin-lwc/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.js';
    const source = readFileSync(componentPath, 'utf8');
    const transformed = await plugin.transform?.call(
      {} as never,
      source,
      componentPath,
    );

    expect(transformed).toBeTruthy();
    expect(typeof transformed).toBe('object');
    expect(
      transformed && 'code' in transformed ? transformed.code : '',
    ).toContain('registerComponent');
    expect(
      transformed && 'code' in transformed ? transformed.code : '',
    ).toContain('./helloWorld.html');
  });

  it('provides an empty module for missing companion styles emitted by the LWC compiler', async () => {
    const plugin = lwc();
    const importer =
      '/Users/jun/Development/github/vitest-plugin-lwc/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.html';
    const resolved = await plugin.resolveId?.call(
      { resolve: async () => null },
      './helloWorld.css',
      importer,
    );

    expect(resolved).toBe(
      '\0vitest-plugin-lwc:missing-style:/Users/jun/Development/github/vitest-plugin-lwc/fixtures/sfdx-project/force-app/main/default/lwc/helloWorld/helloWorld.css',
    );

    const loaded = await plugin.load?.call({} as never, resolved as string);

    expect(loaded).toContain('export default undefined');
  });

  it('defaults Vitest to jsdom for LWC unit tests', async () => {
    const plugin = lwc();
    const config = await plugin.config?.call(
      {} as never,
      {},
      { command: 'serve', mode: 'test' },
    );

    expect(config).toMatchObject({
      test: {
        environment: 'jsdom',
      },
    });
  });
});
