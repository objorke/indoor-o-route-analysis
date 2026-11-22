import { test, expect } from "@playwright/test";

/**
 * Covers the "Find all routes algorithm" setting end-to-end: picking it in
 * Settings → Analysis persists the choice, it survives a reload, and the
 * Route Analysis screen runs with it when "Show all routes" is enabled.
 */

const EXAMPLE_EVENT_NAME = /Fossum/i;
const EXAMPLE_COURSE_NAME = "Lett";
const STORAGE_KEY = "app-route-enumeration-algorithm";

async function openAnalysisSettings(page: import("@playwright/test").Page) {
  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByText("Settings...", { exact: true }).click();
  await page.getByRole("button", { name: "Analysis", exact: true }).click();
}

test("the find-all-routes algorithm can be changed and is persisted", async ({ page }) => {
  await page.goto("/");
  await openAnalysisSettings(page);

  // Defaults to the clustered A* algorithm.
  const selector = page.locator('button[role="combobox"]').first();
  await expect(selector).toContainText("Cluster A*");

  await selector.click();
  await page.getByRole("option", { name: "Basic DFS" }).click();

  await expect(selector).toContainText("Basic DFS");
  // The explanation under the selector follows the selection.
  await expect(page.getByText(/depth-first traversal of the raw graph/i)).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("dfs");

  await page.reload();
  await openAnalysisSettings(page);
  await expect(page.locator('button[role="combobox"]').first()).toContainText("Basic DFS");
});

test("route analysis runs with the selected algorithm when 'Show all routes' is on", async ({ page }) => {
  await page.goto("/");
  await page.evaluate((key) => localStorage.setItem(key, "bfs"), STORAGE_KEY);
  await page.reload();

  await page.locator("button:has(svg.lucide-menu)").click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(EXAMPLE_EVENT_NAME).click();
  await page.waitForTimeout(1000);

  await page.getByRole("button", { name: /^Route Analysis$/ }).click();
  await page.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: EXAMPLE_COURSE_NAME, exact: true }).click();

  // The "Show all routes" toggle names the active algorithm in its tooltip.
  const showAllRoutes = page.locator("button:has(svg.lucide-tractor)");
  await expect(showAllRoutes).toHaveAttribute("title", /algorithm: Basic BFS/);
  await showAllRoutes.click();

  // Analysis still completes: difficulty tags reappear for every leg.
  await expect(page.getByText(/^D\d+$/).first()).toBeVisible({ timeout: 30_000 });
});
