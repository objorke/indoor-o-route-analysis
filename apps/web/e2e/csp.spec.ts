import { test, expect } from "@playwright/test";

/**
 * Visits every screen with an example event loaded and fails on Content
 * Security Policy violations. Only meaningful when the server sends the
 * headers from vercel.json (e.g. the static-build E2E setup, see TASKS.md);
 * against `next dev` there is no CSP and the test passes trivially.
 */
test("no Content-Security-Policy violations on any screen", async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __csp: string[] }).__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective} ${e.blockedURI}`);
    });
  });
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(/Fossum/i).click();
  await expect(page.getByText(/Fossum/i).first()).toBeVisible({ timeout: 10_000 });

  for (const screen of ["Event", "Directions", "Course Setting", "Floors", "Graph", "Route Builder", "Route Analysis", "Event Analysis"]) {
    const button = page.getByRole("button", { name: new RegExp(`^${screen}$`) });
    if ((await button.count()) === 0) continue; // screen hidden behind a feature flag
    await button.click();
    await page.waitForTimeout(800);
  }
  await page.getByRole("button", { name: /^Event$/ }).click();
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await page.waitForTimeout(1500); // PDF render (pdf.js worker)

  const violations = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
  // The example's remote event image (https) is allowed by img-src; nothing else should be blocked
  expect(violations).toEqual([]);
});
