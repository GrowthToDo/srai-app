#!/usr/bin/env node
/**
 * Blocking verification gate (spec: docs/superpowers/specs/2026-07-03-post-fable-operating-system-design.md).
 * Checks, in order, failing fast with a named reason + fix hint:
 *   1. vitest run          — 0 failures required          (--skip-tests to bypass, loudly)
 *   2. tsc --noEmit        — error count <= baseline; auto-ratchets baseline DOWN
 *   3. prettier --check    — staged files only, never repo-wide
 * Writes scripts/.verify-state.json for ground-truth.mjs.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scriptsDir, "..");
const baselinePath = path.join(scriptsDir, "tsc-baseline.json");
const statePath = path.join(scriptsDir, ".verify-state.json");
const skipTests = process.argv.includes("--skip-tests");

function run(cmd, args) {
  const res = spawnSync(cmd, args, {
    cwd: root,
    shell: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    // NO_COLOR: vitest (tinyrainbow) force-enables ANSI colors on win32 even when
    // piped, which breaks the "Tests N passed" regex below. Colorless output only.
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    code: res.status ?? 1,
    out: `${res.stdout ?? ""}\n${res.stderr ?? ""}`,
  };
}

function fail(check, actual, expected, hint) {
  console.error(`\n✗ GATE FAILED — ${check}`);
  console.error(`  actual:   ${actual}`);
  console.error(`  expected: ${expected}`);
  console.error(`  fix:      ${hint}`);
  process.exit(1);
}

const state = {
  testsPassed: null,
  testsFailed: null,
  tscErrors: null,
  at: new Date().toISOString(),
};

// ── 1. Tests ────────────────────────────────────────────────────────────────
if (skipTests) {
  console.warn(
    "⚠⚠⚠  --skip-tests: TEST SUITE NOT RUN. Only acceptable for docs-only commits.  ⚠⚠⚠",
  );
} else {
  console.log("[1/3] vitest run …");
  const t = run("npx", ["vitest", "run", "--reporter=default"]);
  const passed = t.out.match(/Tests\s+(\d+)\s+passed/);
  const failed = t.out.match(/(\d+)\s+failed/);
  state.testsPassed = passed ? Number(passed[1]) : null;
  state.testsFailed = failed ? Number(failed[1]) : 0;
  if (t.code !== 0 || state.testsFailed > 0 || state.testsPassed === null) {
    console.error(t.out.split("\n").slice(-30).join("\n"));
    fail(
      "tests",
      `${state.testsFailed ?? "?"} failed / exit ${t.code}`,
      "0 failed",
      "run `npx vitest run` and fix failures before committing",
    );
  }
  console.log(`      ✓ ${state.testsPassed} tests passed`);
}

// ── 2. Types (ratcheted baseline) ───────────────────────────────────────────
console.log("[2/3] tsc --noEmit …");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8")).maxErrors;
const ts = run("npx", ["tsc", "--noEmit"]);
const tscErrors = (ts.out.match(/error TS\d+/g) ?? []).length;
state.tscErrors = tscErrors;
if (tscErrors > baseline) {
  console.error(
    ts.out
      .split("\n")
      .filter((l) => /error TS\d+/.test(l))
      .slice(0, 20)
      .join("\n"),
  );
  fail(
    "typescript",
    `${tscErrors} errors`,
    `<= ${baseline} (baseline)`,
    "you introduced new type errors — fix them (the app build ignores tsc, so this gate is the only thing watching)",
  );
}
if (tscErrors < baseline) {
  fs.writeFileSync(
    baselinePath,
    JSON.stringify({ maxErrors: tscErrors }) + "\n",
  );
  console.log(
    `      ✓ ${tscErrors} errors — baseline ratcheted ${baseline} → ${tscErrors}. Stage scripts/tsc-baseline.json with this commit.`,
  );
} else {
  console.log(`      ✓ ${tscErrors} errors (== baseline)`);
}

// ── 3. Prettier on staged files only ────────────────────────────────────────
console.log("[3/3] prettier --check (staged files) …");
const stagedRaw = run("git", [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
]).out;
const staged = stagedRaw
  .split("\n")
  .map((f) => f.trim())
  .filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css)$/.test(f))
  .filter((f) => fs.existsSync(path.join(root, f)));
if (staged.length === 0) {
  console.log("      ✓ no staged formattable files — skipped");
} else {
  const p = run("npx", [
    "prettier",
    "--check",
    ...staged.map((f) => JSON.stringify(f)),
  ]);
  if (p.code !== 0) {
    console.error(p.out.trim());
    fail(
      "prettier",
      "staged files not formatted",
      "prettier-clean",
      `npx prettier --write ${staged.join(" ")} && git add ${staged.join(" ")}`,
    );
  }
  console.log(`      ✓ ${staged.length} staged files formatted`);
}

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n");
console.log("\n✓ GATE PASSED");
