#!/usr/bin/env node
/**
 * Generates public/sw.js from scripts/sw-template.js, stamping it with a build
 * id, and writes public/version.json alongside it.
 *
 * Why: a service worker is only considered "updated" when its bytes differ
 * from the installed copy. The build id is the only thing that changes between
 * deploys of an otherwise identical worker, so without this step users would
 * never be offered a new version.
 *
 * Build id, in order of preference:
 *   1. $BUILD_VERSION            — explicit override
 *   2. $VERCEL_GIT_COMMIT_SHA    — set by Vercel builds (short form)
 *   3. `git rev-parse --short HEAD` (+ `-dirty`)
 *   4. the build timestamp
 *
 * Run from apps/web (the `build` script does this). Everything here is local:
 * no network access, no data leaves the machine.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(scriptDir, "..");
const templatePath = join(scriptDir, "sw-template.js");
const publicDir = join(appDir, "public");

function gitVersion() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: appDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!sha) return null;
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      cwd: appDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, string | undefined>} [env]
 * @param {Date} [now]
 * @returns {string}
 */
export function resolveBuildVersion(env = process.env, now = new Date()) {
  const explicit = env.BUILD_VERSION?.trim();
  if (explicit) return explicit;

  const vercelSha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (vercelSha) return vercelSha.slice(0, 8);

  return gitVersion() ?? now.toISOString().replace(/[:.]/g, "-");
}

/**
 * @param {string} template
 * @param {string} version
 * @returns {string}
 */
export function renderServiceWorker(template, version) {
  if (!template.includes("__BUILD_VERSION__")) {
    throw new Error("sw-template.js no longer contains the __BUILD_VERSION__ placeholder");
  }
  return template.replaceAll("__BUILD_VERSION__", version);
}

function main() {
  const version = resolveBuildVersion();
  const template = readFileSync(templatePath, "utf8");

  mkdirSync(publicDir, { recursive: true });
  writeFileSync(join(publicDir, "sw.js"), renderServiceWorker(template, version));
  writeFileSync(
    join(publicDir, "version.json"),
    `${JSON.stringify({ version, buildTime: new Date().toISOString() }, null, 2)}\n`,
  );

  console.log(`✓ Service worker generated (build ${version})`);
}

// Only run when invoked directly, so the helpers above stay unit-testable.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
