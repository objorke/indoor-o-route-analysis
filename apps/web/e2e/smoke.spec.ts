import { test, expect, type Locator } from "@playwright/test";

/** Waits until `locator`'s match count stops changing (difficulty analysis runs asynchronously in chunks). */
async function waitForStableCount(locator: Locator): Promise<number> {
  let lastSeen = -1;
  await expect(async () => {
    const current = await locator.count();
    const matchesLast = current > 0 && current === lastSeen;
    lastSeen = current;
    expect(matchesLast).toBe(true);
  }).toPass({ timeout: 15_000, intervals: [300] });
  return lastSeen;
}

/**
 * Minimal smoke suite for the critical import -> analyze -> persist flow,
 * per CLAUDE.md's E2E-testing requirement and planning/06-testing.md step 3.
 * Runs against a real `next dev` server + real browser IndexedDB/localStorage
 * (via the webServer block in playwright.config.ts) — no mocking.
 */

const EXAMPLE_EVENT_NAME = /Fossum/i;
const EXAMPLE_COURSE_NAME = "Lett";

test("landing page renders", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Indoor Orienteering Route Analysis");
  await expect(page.locator("button:has(svg.lucide-menu)")).toBeVisible();
});

test("import an example event populates the course list and renders the map", async ({ page }) => {
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(EXAMPLE_EVENT_NAME).click();

  // The event name appears in the top-right header once loaded.
  await expect(page.getByText(EXAMPLE_EVENT_NAME).first()).toBeVisible({ timeout: 10_000 });

  // Examples open in Route Analysis with the first course already selected
  await expect(page).toHaveURL(/\/route-analysis/);
  await expect(page.getByRole("combobox", { name: "Course" })).not.toHaveText(/Select a course to analyze/);

  await page.getByRole("button", { name: /^Route Analysis$/ }).click();
  const courseSelect = page.getByRole("combobox", { name: "Course" });
  await expect(courseSelect).toBeVisible({ timeout: 10_000 });
  await courseSelect.click();

  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  expect(await options.count()).toBeGreaterThan(0);
});

test("route analysis renders difficulty numbers for a known course, and survives a reload", async ({ page }) => {
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(EXAMPLE_EVENT_NAME).click();
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /^Route Analysis$/ }).click();
  await page.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: EXAMPLE_COURSE_NAME, exact: true }).click();

  // Each leg row shows a distance ("7 m") and a difficulty category tag
  // ("D19") once analysis finishes; assert the structural shape (tags are
  // present, count is stable) rather than exact score values, since the
  // scoring model is expected to evolve.
  const difficultyTags = page.getByText(/^D\d+$/);
  const tagCountBeforeReload = await waitForStableCount(difficultyTags);
  await expect(page.getByText(/^\d+\s*m$/).first()).toBeVisible();

  // Reload: the app persists selected event/course to localStorage and the
  // event data itself to IndexedDB (persistToDB defaults to true), so the
  // same course's analysis should reappear without re-importing anything.
  await page.reload();
  const tagCountAfterReload = await waitForStableCount(difficultyTags);
  expect(tagCountAfterReload).toBe(tagCountBeforeReload);
});
