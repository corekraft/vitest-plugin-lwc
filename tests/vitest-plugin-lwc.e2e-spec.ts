import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

describe('lwc plugin end to end', () => {
  it(
    'runs the fixture Lightning Web Component unit test without mocks',
    async () => {
      const fixtureRoot = path.resolve(import.meta.dirname, '../fixtures/sfdx-project');
      const packageRoot = path.resolve(import.meta.dirname, '..');
      const nodePath = [
        path.join(packageRoot, 'node_modules'),
        process.env.NODE_PATH,
      ]
        .filter(Boolean)
        .join(path.delimiter);

      await expect(
        execFileAsync('npm', ['run', 'test:unit'], {
          cwd: fixtureRoot,
          env: {
            ...process.env,
            NODE_PATH: nodePath,
          },
        }),
      ).resolves.toMatchObject({
        stdout: expect.stringContaining('1 passed'),
      });
    },
    30000,
  );
});
