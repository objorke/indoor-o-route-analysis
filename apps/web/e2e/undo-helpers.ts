import { expect, type Page } from "@playwright/test";

/** Opens the File menu, checks that Undo names the last change, and closes the menu again. */
export async function expectUndoLabel(page: Page, label: RegExp) {
  await page.locator("button:has(svg.lucide-menu)").first().click();
  await expect(page.getByRole("button", { name: new RegExp(`^Undo ${label.source}`) })).toBeEnabled();
  const size = page.viewportSize();
  await page.mouse.click((size?.width ?? 800) - 5, (size?.height ?? 600) - 5); // click outside closes the menu
}
