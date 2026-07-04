#!/usr/bin/env node
// npm `prepare` script: activate the committed .githooks dir as core.hooksPath.
// Must skip silently when there is no .git directory — Railway's build
// container runs `npm ci` on an exported tree (not a git checkout), and a
// bare `git config` there fails with exit 128 and kills the whole build.
import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(path.join(root, ".git"))) {
  console.log("[setup-hooks] no .git directory — skipping hook setup");
  process.exit(0);
}

execSync("git config core.hooksPath .githooks", {
  cwd: root,
  stdio: "inherit",
});
console.log("[setup-hooks] core.hooksPath -> .githooks");
