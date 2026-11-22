import { defineConfig } from "@playwright/test";

// E2E_BASE_URL runs the suite against an already-running server (e.g. a static
// build served from `out/`) instead of starting `pnpm dev`.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: externalBaseUrl ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
      },
});
