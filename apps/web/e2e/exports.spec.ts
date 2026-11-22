import { test, expect } from "@playwright/test";
import * as fs from "node:fs";

/** Map exports from Route Analysis (downloads, checked by size and type). */
test("export all legs of a course as a PDF", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").first().click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(/Fossum/i).click();
  await expect(page.getByText(/Fossum/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Route Analysis$/ }).click();
  await page.getByRole("combobox", { name: "Course" }).click();
  await page.getByRole("option", { name: "Lett", exact: true }).click();
  await page.waitForTimeout(2000); // map render + analysis

  await page.locator("button:has(svg.lucide-menu)").last().click();
  await page.getByText("Export map...", { exact: true }).click();
  await page.locator("#fmt-pdf").click();
  await page.locator("#scope-all").click();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/all-legs\.pdf$/);
  const path = await file.path();
  const bytes = fs.readFileSync(path!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  expect(bytes.length).toBeGreaterThan(10_000);
});
