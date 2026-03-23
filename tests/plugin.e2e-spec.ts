import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");
const nodePath = [path.join(packageRoot, "node_modules"), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);

const fixtures = [
  {
    name: "sfdx-project",
    root: path.resolve(import.meta.dirname, "../fixtures/sfdx-project"),
    expectedOutput: "1 passed",
  },
  {
    name: "lwc-recipes",
    root: path.resolve(import.meta.dirname, "../fixtures/lwc-recipes"),
    expectedOutput: "439 passed",
  },
];

describe("lwc plugin end to end", () => {
  for (const fixture of fixtures) {
    it(`runs the ${fixture.name} fixture test suite`, async () => {
      await expect(
        execFileAsync("npm", ["run", "test:unit"], {
          cwd: fixture.root,
          env: {
            ...process.env,
            NODE_PATH: nodePath,
          },
        }),
      ).resolves.toMatchObject({
        stdout: expect.stringContaining(fixture.expectedOutput),
      });
    }, 60000);
  }
});
