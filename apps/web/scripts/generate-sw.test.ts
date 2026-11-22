import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderServiceWorker, resolveBuildVersion } from "./generate-sw.mjs";

const templatePath = join(__dirname, "sw-template.js");

describe("resolveBuildVersion", () => {
  it("prefers an explicit BUILD_VERSION", () => {
    expect(resolveBuildVersion({ BUILD_VERSION: "v1.2.3", VERCEL_GIT_COMMIT_SHA: "abc" })).toBe("v1.2.3");
  });

  it("falls back to the short Vercel commit sha", () => {
    expect(resolveBuildVersion({ VERCEL_GIT_COMMIT_SHA: "0123456789abcdef" })).toBe("01234567");
  });

  it("always produces a non-empty version", () => {
    const version = resolveBuildVersion({}, new Date("2026-01-02T03:04:05.678Z"));
    expect(version.length).toBeGreaterThan(0);
    expect(version).not.toContain(":");
  });
});

describe("renderServiceWorker", () => {
  const template = readFileSync(templatePath, "utf8");

  it("stamps the build version into the worker", () => {
    const rendered = renderServiceWorker(template, "test-build");
    expect(rendered).toContain("const BUILD_VERSION = 'test-build'");
    expect(rendered).not.toContain("__BUILD_VERSION__");
  });

  it("throws if the placeholder is gone, instead of shipping an unversioned worker", () => {
    expect(() => renderServiceWorker("// no placeholder here", "x")).toThrow(/__BUILD_VERSION__/);
  });
});

describe("sw-template.js", () => {
  const template = readFileSync(templatePath, "utf8");

  it("waits instead of skipping on install, so the user is asked first", () => {
    const installBlock = template.slice(
      template.indexOf("addEventListener('install'"),
      template.indexOf("addEventListener('activate'"),
    );
    expect(installBlock).not.toContain("skipWaiting");
  });

  it("activates on demand when the page posts SKIP_WAITING", () => {
    expect(template).toContain("data.type === 'SKIP_WAITING'");
    expect(template).toContain("self.skipWaiting()");
  });
});
