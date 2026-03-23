# `@corekraft/vitest-plugin-lwc`

Vitest plugin for testing Lightning Web Components in Salesforce projects.

## Setup

Create [vitest.config.mjs](/Users/jun/Development/github/vitest-plugin-lwc/fixtures/lwc-recipes/vitest.config.mjs):

```js
import { defineConfig } from "vitest/config";
import lwc from "@corekraft/vitest-plugin-lwc";

export default defineConfig({
  plugins: [lwc()],
});
```

This configuration is all you need as a starting vitest configuration. Follow [#package-scripts](#package-scripts)

### Package Scripts

Add or modify your test script in your package.json. Follow [#running](#running)

```json
{
  "scripts": {
    "test:unit": "vitest run"
  }
}
```

### Running

Then run:

```bash
npm test:unit
```

## What It Does

Out of the box, the plugin:

- resolves `c/*` component imports from `force-app/main/default/lwc`
- resolves `lightning/*` modules from project mocks or `@salesforce/sfdx-lwc-jest` stubs
- provides virtual shims for `@salesforce/*` imports such as `apex`, `schema`, `user`, `i18n`, `resourceUrl`, and message channels
- compiles LWC source with `@lwc/compiler`
- generates a managed Vitest setup file automatically
- enables `jsdom`, globals, coverage defaults, and LWC test file discovery
- exposes `jest` as `vi` compatibility for existing tests that still use `jest.mock()` and `jest.fn()`

## Install

```bash
pnpm add -D vitest @vitest/coverage-v8 @corekraft/vitest-plugin-lwc
```

If your project already uses `@salesforce/sfdx-lwc-jest`, keep it installed. The plugin reuses its Lightning stubs.

## Existing Jest-Style LWC Tests

This plugin is designed to help projects move from `sfdx-lwc-jest` to Vitest with minimal churn.

Existing test suites can continue to use patterns like:

- `jest.mock(...)`
- `jest.fn(...)`
- `jest.requireActual(...)`

The plugin rewrites those test helpers to Vitest-compatible behavior during transform.

## Optional Extras

If these packages exist in the project, the generated setup file will use them automatically:

- `jest-canvas-mock`
- `@sa11y/preset-rules`
- `@sa11y/matcher`

That means you can add them only when your test suite needs them.

## Notes

- This plugin expects a Salesforce DX project with `sfdx-project.json`.
- The default test include pattern is `**/lwc/**/*.test.js`.
- The default test environment is `jsdom`.
- The plugin writes a managed setup file under `.vitest-plugin-lwc/`.

## Example

The fixtures in this repository show the intended setup shape:

- [fixtures/sfdx-project/vitest.config.js](/Users/jun/Development/github/vitest-plugin-lwc/fixtures/sfdx-project/vitest.config.js)
- [fixtures/lwc-recipes/vitest.config.mjs](/Users/jun/Development/github/vitest-plugin-lwc/fixtures/lwc-recipes/vitest.config.mjs)
