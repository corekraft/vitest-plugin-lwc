import { existsSync, mkdirSync, rmSync, symlinkSync } from "node:fs";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(import.meta.dirname, "..");
const packageDist = path.join(packageRoot, "dist");
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
  const createdLinkPaths = [];

  beforeAll(() => {
    for (const fixture of fixtures) {
      const linkPaths = [
        path.join(fixture.root, "node_modules/@corekraft/vitest-plugin-lwc"),
        path.join(fixture.root, "node_modules/.vite-temp/node_modules/@corekraft/vitest-plugin-lwc"),
      ];

      for (const linkPath of linkPaths) {
        if (existsSync(linkPath)) {
          continue;
        }

        mkdirSync(path.dirname(linkPath), { recursive: true });
        rmSync(linkPath, { force: true, recursive: true });
        symlinkSync(packageDist, linkPath, "junction");
        createdLinkPaths.push(linkPath);
      }
    }
  });

  afterAll(() => {
    for (const linkPath of createdLinkPaths) {
      rmSync(linkPath, { force: true, recursive: true });
    }
  });

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
