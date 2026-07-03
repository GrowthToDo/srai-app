#!/usr/bin/env node
/**
 * Ground-truth report: mechanical facts to compare against a subagent's
 * self-report. A self-report is a hypothesis; this output is the fact.
 * Never fails — it reports. (spec: docs/superpowers/specs/2026-07-03-…-design.md)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const args = process.argv.slice(2);
const sinceIdx = args.indexOf("--since");
const ref = sinceIdx !== -1 ? args[sinceIdx + 1] : "HEAD";
const full = args.includes("--full");

function run(cmd, cmdArgs) {
  const res = spawnSync(cmd, cmdArgs, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // NO_COLOR: vitest (tinyrainbow) force-enables ANSI colors on win32 even when
    // piped, which breaks the "Tests N passed" regex below. Colorless output only.
    env: { ...process.env, NO_COLOR: "1" },
  });
  return `${res.stdout ?? ""}${res.stderr ?? ""}`.trim();
}

console.log(`── GROUND TRUTH (vs ${ref}) ──────────────────────────────`);

console.log("\n# git diff --stat");
console.log(run("git", ["diff", ref, "--stat"]) || "(no tracked changes)");

const untracked = run("git", ["ls-files", "--others", "--exclude-standard"]);
console.log("\n# untracked files");
console.log(untracked || "(none)");

console.log("\n# staged (git diff --cached --stat)");
console.log(run("git", ["diff", "--cached", "--stat"]) || "(nothing staged)");

// Baselines
let baseline = "?";
try {
  baseline = JSON.parse(
    fs.readFileSync(path.join(scriptsDir, "tsc-baseline.json"), "utf8"),
  ).maxErrors;
} catch {}
let last = null;
try {
  last = JSON.parse(
    fs.readFileSync(path.join(scriptsDir, ".verify-state.json"), "utf8"),
  );
} catch {}

console.log("\n# recorded state (last verify run)");
console.log(
  last
    ? `${last.testsPassed} tests passed, ${last.testsFailed} failed, ${last.tscErrors} tsc errors — at ${last.at}`
    : "(none — run `npm run verify` to record one)",
);
console.log(`tsc baseline: ${baseline}`);

if (full) {
  console.log("\n# live run (--full)");
  const t = run("npx", ["vitest", "run", "--reporter=default"]);
  const passed = t.match(/Tests\s+(\d+)\s+passed/)?.[1] ?? "?";
  const failed = t.match(/(\d+)\s+failed/)?.[1] ?? "0";
  const tsOut = run("npx", ["tsc", "--noEmit"]);
  const tscNow = (tsOut.match(/error TS\d+/g) ?? []).length;
  console.log(`tests now: ${passed} passed, ${failed} failed`);
  console.log(`tsc now:   ${tscNow} errors (baseline ${baseline})`);
  if (last) {
    console.log(
      `delta:     tests ${passed - last.testsPassed >= 0 ? "+" : ""}${passed - last.testsPassed}, tsc ${tscNow - last.tscErrors >= 0 ? "+" : ""}${tscNow - last.tscErrors}`,
    );
  }
}

console.log(
  "\n── Compare the above against the agent's claim. Clean tree + a claim of edits = red flag. ──",
);
