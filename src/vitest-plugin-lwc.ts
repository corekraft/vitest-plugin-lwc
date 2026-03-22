import type { Vite, VitestPluginContext } from 'vitest/node';

export function plugin(): Vite.Plugin {
  return {
    name: 'vitest:my-plugin',
    configureVitest(context: VitestPluginContext) {
      // ...
    },
  };
}
