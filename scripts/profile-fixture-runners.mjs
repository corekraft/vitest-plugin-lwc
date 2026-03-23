import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const fixtureSource = path.join(repoRoot, "fixtures", "lwc-recipes");
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "lwc-runner-profile-"));
const jestTempDir = path.join(tempRoot, "tmp-jest");
const vitestTempDir = path.join(tempRoot, "tmp-vitest");

fs.mkdirSync(jestTempDir, { recursive: true });
fs.mkdirSync(vitestTempDir, { recursive: true });

function pipeWithPrefix(stream, prefix) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    console.log(`[${prefix}] ${line}`);
  });
}

function runProfile(name, command, args, workdir, extraEnv = {}) {
  return new Promise((resolve) => {
    const startedAt = process.hrtime.bigint();
    const child = spawn(command, args, {
      cwd: workdir,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    pipeWithPrefix(child.stdout, name);
    pipeWithPrefix(child.stderr, name);

    child.on("close", (code, signal) => {
      const finishedAt = process.hrtime.bigint();
      resolve({
        code: code ?? 1,
        durationMs: Number(finishedAt - startedAt) / 1_000_000,
        name,
        signal,
      });
    });
  });
}

console.log(`Profiling with isolated caches under ${tempRoot}`);

console.log("Starting Jest profile: npm run test:unit:jest");
const jestResult = await runProfile(
  "jest",
  "npm",
  ["run", "test:unit:jest"],
  fixtureSource,
  {
    JEST_CACHE_DIR: path.join(tempRoot, "cache-jest"),
    TMPDIR: jestTempDir,
  },
);

console.log("Starting Vitest profile: npm run test");
const vitestResult = await runProfile(
  "vitest",
  "npm",
  ["run", "test"],
  fixtureSource,
  {
    VITE_CACHE_DIR: path.join(tempRoot, "cache-vitest"),
    TMPDIR: vitestTempDir,
  },
);

console.log("");
console.log("Profile summary");
console.log(`Jest:   ${jestResult.durationMs.toFixed(0)}ms (exit ${jestResult.code})`);
console.log(`Vitest: ${vitestResult.durationMs.toFixed(0)}ms (exit ${vitestResult.code})`);

if (jestResult.code !== 0 || vitestResult.code !== 0) {
  process.exit(1);
}
