import { test, expect } from "@playwright/test";

/** Graph view: verification and "connect overlapping controls" (logic in core graph-verification.ts). */
test("verify the graph and connect overlapping controls (undoable)", async ({ page }) => {
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").first().click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(/Fossum/i).click();
  await expect(page.getByText(/Fossum/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Graph$/ }).click();
  await expect(page.getByText("Graph Statistics")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500); // graph loads from the event after the map renders

  await page.getByRole("button", { name: "Verify graph" }).click();
  await expect(page.getByText(/Graph verified\. No issues\.|Validation Findings \(\d+\)/)).toBeVisible();
  // The button toggles the validation panel
  const verify = page.getByRole("button", { name: "Verify graph" });
  await expect(verify).toHaveAttribute("aria-pressed", "true");
  await verify.click();
  await expect(page.getByText(/Graph verified\. No issues\.|Validation Findings \(\d+\)/)).toHaveCount(0);
  await expect(verify).toHaveAttribute("aria-pressed", "false");

  // "Graph size: 393" row in the statistics panel
  const edgeCount = async () => {
    const panel = page.getByText("Graph Statistics", { exact: true }).locator("../.."); // heading → toggle → section
    return Number((/Graph size:\s*(\d+)/.exec(await panel.innerText()) ?? [0, -1])[1]);
  };

  const before = await edgeCount();
  expect(before).toBeGreaterThan(0);
  await page.locator("button:has(svg.lucide-menu)").last().click();
  await page.getByText("Connect overlapping").click();
  const toast = page.getByRole("status").filter({ hasText: /between overlapping controls\/nodes/ });
  await expect(toast).toBeVisible();
  const text = await toast.innerText();
  const added = Number((/added (\d+)/i.exec(text) ?? [0, 0])[1]);
  const removed = Number((/removed (\d+)/i.exec(text) ?? [0, 0])[1]);
  await expect.poll(edgeCount).toBe(before + added - removed);
  if (added + removed > 0) {
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(edgeCount).toBe(before);
  }
  // Running it again changes nothing: exactly one edge per overlapping pair
  await page.locator("button:has(svg.lucide-menu)").last().click();
  await page.getByText("Connect overlapping").click();
  await page.locator("button:has(svg.lucide-menu)").last().click();
  await page.getByText("Connect overlapping").click();
  await expect(page.getByRole("status").filter({ hasText: /already joined by exactly one zero-length edge/ }).last()).toBeVisible();
});

test("graph statistics can be collapsed, and the state is remembered", async ({ page }) => {
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").first().click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(/Fossum/i).click();
  await expect(page.getByText(/Fossum/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Graph$/ }).click();
  const toggle = page.getByRole("button", { name: /Graph Statistics/ });
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/Graph size:/)).toBeVisible();
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText(/Graph size:/)).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /^Graph$/ }).click();
  await expect(page.getByRole("button", { name: /Graph Statistics/ })).toHaveAttribute("aria-expanded", "false");
});
