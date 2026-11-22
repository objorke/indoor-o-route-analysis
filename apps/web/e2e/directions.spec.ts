import { expectUndoLabel } from "./undo-helpers";
import { test, expect, type Page } from "@playwright/test";

/** Directions view: drawing ISInOM direction symbols. */

/** The Directions view is behind a feature flag (Settings → Features). */
async function enableDirectionsFlag(page: Page) {
  await page.addInitScript(() => localStorage.setItem("feature-flags", JSON.stringify({ directions: true })));
}

test("the Directions view is hidden until its feature flag is on", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Event$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Directions$/ })).toHaveCount(0);
});

async function openDirections(page: Page) {
  await enableDirectionsFlag(page);
  await page.goto("/");
  await page.locator("button:has(svg.lucide-menu)").first().click();
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(/Fossum/i).click();
  await expect(page.getByText(/Fossum/i).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Directions$/ }).click();
  await expect(page.getByText("No direction symbols yet")).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500); // PDF render
  const box = (await page.locator("canvas").first().boundingBox())!;
  // The canvas can be larger than the viewport; work in its visible top-left part
  return (dx: number, dy: number) => ({ x: box.x + 150 + dx, y: box.y + 150 + dy });
}

const list = (page: Page) => page.getByTestId("directions-list").locator("li");

test("the view sits before Course Setting in the top bar", async ({ page }) => {
  await enableDirectionsFlag(page);
  await page.goto("/");
  const names = await page.locator("header button").allInnerTexts();
  const directions = names.findIndex((n) => n.trim() === "Directions");
  const course = names.findIndex((n) => n.trim() === "Course Setting");
  expect(directions).toBeGreaterThan(-1);
  expect(directions).toBe(course - 1);
});

test("draw an uncrossable border (clicks + Enter), then undo and redo it", async ({ page }) => {
  const at = await openDirections(page);
  await page.keyboard.press("u");
  for (const [dx, dy] of [[0, 0], [80, 0], [80, 60]]) {
    const p = at(dx, dy);
    await page.mouse.click(p.x, p.y);
  }
  await expect(page.getByTestId("directions-draft")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(list(page)).toHaveCount(1);
  await expect(list(page).first()).toContainText("Uncrossable border");
  const line = page.locator('[data-direction-kind="uncrossable"] polyline').nth(1);
  await expect(line).toHaveAttribute("stroke", /#5B1A6E/i);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(list(page)).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(list(page)).toHaveCount(1);
});

test("out-of-bounds area needs three corners and is hatched; double-click finishes", async ({ page }) => {
  const at = await openDirections(page);
  await page.keyboard.press("a");
  let p = at(0, 0);
  await page.mouse.click(p.x, p.y);
  p = at(60, 0);
  await page.mouse.click(p.x, p.y);
  await page.keyboard.press("Enter"); // only two corners: not enough
  await expect(list(page)).toHaveCount(0);
  p = at(60, 60);
  await page.mouse.dblclick(p.x, p.y);
  await expect(list(page)).toHaveCount(1);
  await expect(page.locator('[data-direction-kind="oob-area"] polygon[fill="url(#directions-view-oob-hatch)"]')).toHaveCount(1);
  // ...with its 0.4 mm boundary line (the new area is selected, so there is also a halo)
  await expect(page.locator('[data-direction-kind="oob-area"] polygon[stroke="#A626AA"]')).toHaveCount(1);
});

test("place, rotate and delete a compulsory crossing; one-way arrows follow the chosen style", async ({ page }) => {
  const at = await openDirections(page);
  await page.keyboard.press("c");
  let p = at(40, 40);
  await page.mouse.click(p.x, p.y);
  await expect(list(page)).toHaveCount(1);
  const rotation = page.locator("#directions-rotation");
  await expect(rotation).toHaveValue("0");
  await page.keyboard.press("r");
  await expect(rotation).toHaveValue("15");
  await page.keyboard.press("Shift+r");
  await page.keyboard.press("Shift+r");
  await expect(rotation).toHaveValue("345");

  await page.keyboard.press("w");
  await page.getByRole("radio", { name: "Single arrow" }).click();
  for (const [dx, dy] of [[0, 100], [200, 100]]) {
    p = at(dx, dy);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Enter");
  await expect(list(page)).toHaveCount(2);
  await expect(page.locator('[data-direction-kind="one-way"] polygon')).toHaveCount(1);

  // Esc deselects the selected symbol (the properties panel closes), then select it again from the list
  await expect(page.getByTestId("directions-properties")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("directions-properties")).toHaveCount(0);
  await list(page).last().click();
  // Delete the selected one-way passage with the Delete key (Select tool)
  await page.keyboard.press("v");
  await page.keyboard.press("Delete");
  await expect(list(page)).toHaveCount(1);
  await page.getByRole("button", { name: "Delete Compulsory crossing" }).click();
  await expect(list(page)).toHaveCount(0);
});

test("directions show in Course Setting and Route Analysis too", async ({ page }) => {
  const at = await openDirections(page);
  await page.keyboard.press("b");
  for (const [dx, dy] of [[0, 0], [100, 0]]) {
    const p = at(dx, dy);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: /^Course Setting$/ }).click();
  await expect(page.locator('[data-direction-kind="oob-boundary"]')).toHaveCount(1, { timeout: 10_000 });
  await page.getByRole("button", { name: /^Route Analysis$/ }).click();
  await expect(page.locator('[data-direction-kind="oob-boundary"]')).toHaveCount(1, { timeout: 10_000 });
});

test("edit points of a selected line: drag, delete and add", async ({ page }) => {
  const at = await openDirections(page);
  await page.keyboard.press("u");
  for (const [dx, dy] of [[0, 0], [120, 0], [120, 90]]) {
    const p = at(dx, dy);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press("Enter");
  await page.keyboard.press("v");
  const handles = page.getByTestId("directions-vertices").locator("rect");
  await expect(handles).toHaveCount(3);
  const line = page.locator('[data-direction-kind="uncrossable"] polyline[stroke="#5B1A6E"]');
  const before = await line.getAttribute("points");

  // Drag the corner point
  const corner = (await handles.nth(1).boundingBox())!;
  await page.mouse.move(corner.x + 4, corner.y + 4);
  await page.mouse.down();
  await page.mouse.move(corner.x + 30, corner.y + 30, { steps: 6 });
  await page.mouse.up();
  await expect(line).not.toHaveAttribute("points", before!);
  await expectUndoLabel(page, /Move point/);

  // Double-click a point deletes it; double-clicking the line adds one
  const last = (await handles.nth(2).boundingBox())!;
  await page.mouse.dblclick(last.x + 4, last.y + 4);
  await expect(handles).toHaveCount(2);
  const a = (await handles.nth(0).boundingBox())!;
  const b = (await handles.nth(1).boundingBox())!;
  await page.mouse.dblclick((a.x + b.x) / 2 + 4, (a.y + b.y) / 2 + 4);
  await expect(handles).toHaveCount(3);
});
