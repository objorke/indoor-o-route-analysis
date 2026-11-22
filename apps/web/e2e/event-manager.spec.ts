import { expectUndoLabel } from "./undo-helpers";
import { test, expect, type Page } from "@playwright/test";

/**
 * Event view (Event / Map / Controls tabs), app settings (theme, show
 * control points), and the Course Setting map-exchange and 3D-model toolbars.
 * See planning/09-map-tab-usability.md.
 */

const EXAMPLE_EVENT_NAME = /Fossum/i;

async function openMenu(page: Page) {
  await page.locator("button:has(svg.lucide-menu)").click();
}

async function newEvent(page: Page) {
  await page.goto("/");
  await openMenu(page);
  await page.getByRole("button", { name: "New", exact: true }).click();
}

async function loadExample(page: Page) {
  await page.goto("/");
  await openMenu(page);
  await page.getByText("Examples", { exact: true }).click();
  await page.getByText(EXAMPLE_EVENT_NAME).click();
  await expect(page.getByText(EXAMPLE_EVENT_NAME).first()).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /^Event$/ }).click();
}

async function openSettings(page: Page) {
  await openMenu(page);
  await page.getByText("Settings...", { exact: true }).click();
}

// 1×1 transparent PNG
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test("tabs are named Event and Map; the Map tab shows only Import when no map is loaded", async ({ page }) => {
  await newEvent(page);
  await expect(page.getByRole("tab", { name: "Event", exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.getByRole("button", { name: /Import map/ })).toBeVisible();
  await expect(page.getByText("Coordinate transform")).toHaveCount(0);
  await expect(page.getByText("Map scale")).toHaveCount(0);
});

/** Minimal one-page A4 PDF (595×842 pt ≈ 210×297 mm). */
function minimalPdf(): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

test("Map tab: importing a PDF shows the map options with its size", async ({ page }) => {
  await newEvent(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await page.locator('input[type="file"][accept=".pdf"]').setInputFiles({
    name: "venue.pdf",
    mimeType: "application/pdf",
    buffer: minimalPdf(),
  });
  await expect(page.getByText("venue.pdf")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/1 page · 210 × 297 mm/)).toBeVisible();
  await expect(page.locator("#save-encoded")).toHaveAttribute("data-state", "checked");
  await expect(page.getByLabel("Bottom-right X")).toHaveValue(/^209\.9/); // 595 pt
});

test("Event tab: renamed labels, https:// placeholders, and embedding an image file", async ({ page }) => {
  await newEvent(page);
  await expect(page.getByText("Event maps download site")).toBeVisible();
  await expect(page.getByText(/\bURL\b/)).toHaveCount(0);
  await expect(page.locator("#event-url")).toHaveAttribute("placeholder", "https://");

  await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await expect(page.getByText(/Embedded image \(image\/png/)).toBeVisible();
  await expect(page.locator('img[alt="Event preview"]')).toHaveAttribute("src", /^data:image\/png;base64,/);

  await page.getByRole("button", { name: "Remove embedded image" }).click();
  await expect(page.locator("#event-image-url")).toHaveValue("");
});

test("Map tab: info line, deferred numeric input, reset transform, undo and redo", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();

  await expect(page.getByText(/\d+(\.\d)? (MB|kB) · \d+ pages? · \d+ × \d+ mm/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Show control points")).toHaveCount(0); // moved to app settings

  const tlx = page.getByLabel("Top-left X");
  const original = await tlx.inputValue();
  await tlx.click();
  await tlx.fill("-");
  await expect(tlx).toHaveValue("-"); // not replaced by 0 while typing
  await tlx.fill("-12.5");
  await tlx.press("Enter");
  await expect(tlx).toHaveValue("-12.5");

  // Invalid input reverts on blur
  await tlx.fill("abc");
  await page.getByLabel("Top-left Y").click();
  await expect(tlx).toHaveValue("-12.5");

  // Reset changes the transform and offers Undo
  await page.getByRole("button", { name: "Reset transform" }).click();
  await page.getByRole("menuitem", { name: /origin top-left/ }).click();
  await expect(tlx).not.toHaveValue("-12.5");
  // Undo (File menu names the change; Ctrl/Cmd+Z) reverts it
  await expectUndoLabel(page, /Reset transform/);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(tlx).toHaveValue("-12.5");
  // ... and Redo re-applies it
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(tlx).not.toHaveValue("-12.5");
  expect(original).not.toBe("-12.5");
});

test("Controls tab: deleting a used control asks first and removes it", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Controls" }).click();
  const deleteButtons = page.getByRole("button", { name: /^Delete control / });
  const before = await deleteButtons.count();
  expect(before).toBeGreaterThan(0);
  const heading = page.getByRole("heading", { name: /\d+ controls?/ });
  await expect(heading).toHaveText(`${before} control${before === 1 ? "" : "s"}`);

  // Find a control used in courses (non-empty "Used In")
  const row = page.locator("tbody tr").filter({ has: page.locator("td:nth-child(7)", { hasNotText: /^-$/ }) }).first();
  const id = (await row.locator("td").first().innerText()).trim();
  await row.getByRole("button", { name: `Delete control ${id}` }).click();
  await expect(page.getByText(new RegExp(`Control ${id} is used in \\d+ course`))).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(deleteButtons).toHaveCount(before - 1);
  await expect(page.getByRole("button", { name: `Delete control ${id}`, exact: true })).toHaveCount(0);
});

test("Settings: theme and show-control-points are applied and persisted", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("radio", { name: /Light/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

  await page.getByRole("tab", { name: "Rendering" }).click();
  const sw = page.getByRole("switch", { name: "Controls with focus point" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("app-show-control-points"))).toBe("true");
});

test("Course Setting: map exchange can be set on a course control", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("button", { name: /^Course Setting$/ }).click();
  // The row buttons only exist once a course is selected
  const rowButtons = page.locator('button[title^="Map exchange:"]');
  if ((await rowButtons.count()) === 0) {
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole("option").first().click();
  }
  await expect(rowButtons.first()).toBeVisible({ timeout: 10_000 });
  await rowButtons.first().click();
  await expect(page.locator("span", { hasText: /^change$/ }).first()).toBeVisible();
  await rowButtons.first().click();
  await expect(page.locator("span", { hasText: /^flip$/ }).first()).toBeVisible();
});

test("Floors: tool toolbar switches tools with shortcuts", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("button", { name: /^Floors$/ }).click();
  await expect(page.getByText("Click a polygon to select it")).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press("p");
  await expect(page.getByText(/Click to add points, Enter to finish/)).toBeVisible();
  await page.keyboard.press("r");
  await expect(page.getByText(/Press inside a polygon, drag to the matching point/)).toBeVisible();
});

test("Course Setting: control coordinates accept decimals and negatives, applied on Enter", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("button", { name: /^Course Setting$/ }).click();
  const rowButtons = page.locator('button[title^="Map exchange:"]');
  if ((await rowButtons.count()) === 0) {
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole("option").first().click();
  }
  await expect(rowButtons.first()).toBeVisible({ timeout: 10_000 });
  // Select the first control in the course list (its row holds a map-exchange button)
  await page.locator("tr", { has: rowButtons.first() }).first().click();

  const x = page.getByLabel("X coordinate (mm)");
  await expect(x).toBeVisible();
  await x.fill("-12.75");
  await expect(x).toHaveValue("-12.75");
  await x.press("Enter");
  await x.evaluate((el) => (el as HTMLInputElement).blur());
  await expect(x).toHaveValue("-12.75"); // stored, not truncated to an integer
});

test("Undo (Ctrl/Cmd+Z) restores a deleted control; it doesn't fire while typing in a field", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Controls" }).click();
  const deleteButtons = page.getByRole("button", { name: /^Delete control / });
  const before = await deleteButtons.count();
  const unused = page.locator("tbody tr").filter({ has: page.locator("td:nth-child(7)", { hasText: /^-$/ }) });
  const row = (await unused.count()) > 0 ? unused.first() : page.locator("tbody tr").first();
  await row.getByRole("button", { name: /^Delete control / }).click();
  const confirm = page.getByRole("button", { name: "Delete", exact: true });
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await expect(deleteButtons).toHaveCount(before - 1);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(deleteButtons).toHaveCount(before);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(deleteButtons).toHaveCount(before - 1);

  // In a text field the browser's own undo applies, not the app's
  await page.getByRole("tab", { name: "Event", exact: true }).click();
  const title = page.locator("#event-title");
  await title.click();
  await page.keyboard.press("ControlOrMeta+z");
  await page.getByRole("tab", { name: "Controls" }).click();
  await expect(deleteButtons).toHaveCount(before - 1);
});

test("Map tab: reset to mm (top-left / bottom-left) and Ctrl/Cmd+O opens the file picker", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  const tly = page.getByLabel("Top-left Y");
  const bry = page.getByLabel("Bottom-right Y");
  await expect(tly).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Reset transform" }).click();
  await page.getByRole("menuitem", { name: /origin bottom-left/ }).click();
  await expect(bry).toHaveValue("0");
  expect(Number(await tly.inputValue())).toBeGreaterThan(400); // page height (mm), Y up
  await expect(page.getByText("(uniform ✓)")).toBeVisible();

  await page.getByRole("button", { name: "Reset transform" }).click();
  await page.getByRole("menuitem", { name: /origin top-left/ }).click();
  await expect(tly).toHaveValue("0");
  expect(Number(await bry.inputValue())).toBeGreaterThan(400);

  const chooser = page.waitForEvent("filechooser");
  await page.keyboard.press("ControlOrMeta+o");
  expect((await chooser).isMultiple()).toBe(false);
});

test("Map tab: coordinate transform tool: click to place, drag a mark, then Apply", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  const tlx = page.getByLabel("Top-left X");
  const brx = page.getByLabel("Bottom-right X");
  await expect(tlx).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500); // PDF render
  await expect(page.getByRole("button", { name: /Lock aspect ratio/ })).toHaveCount(0); // always uniform

  // T opens the tool with the two controls farthest apart; marks start on the controls
  await page.keyboard.press("t");
  await expect(page.getByText(/Click on the map where control \S+ is, or drag its mark \(tip: use two controls far apart\)/)).toBeVisible();
  const apply = page.getByRole("button", { name: /Apply/ });
  await expect(apply).toBeEnabled();

  // Applying with untouched marks keeps the transform (to rounding)
  const before = Number(await brx.inputValue());
  await apply.click();
  await expect(page.getByText(/max error \d+\.\d mm/)).toBeVisible();
  expect(Math.abs(Number(await brx.inputValue()) - before)).toBeLessThan(1);

  // Click places control 1, then control 2; nothing changes until Apply
  const box = (await page.locator("canvas").first().boundingBox())!;
  const p1 = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.35 };
  const p2 = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.65 };
  await page.getByRole("group", { name: "Control 1" }).locator("svg").first().click(); // any click in the slot activates it
  await page.mouse.click(p1.x, p1.y);
  await expect(page.getByText(/Click on the map where control \S+ is, or drag its mark$/)).toBeVisible();
  await page.mouse.click(p2.x, p2.y);
  const placed = { tl: await tlx.inputValue(), br: await brx.inputValue() };

  // Drag the second mark, then Apply
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.down();
  await page.mouse.move(p2.x + 40, p2.y + 30, { steps: 6 });
  await page.mouse.up();
  expect(await brx.inputValue()).toBe(placed.br);
  await apply.click();
  await expect.poll(async () => (await tlx.inputValue()) !== placed.tl || (await brx.inputValue()) !== placed.br).toBe(true);
  await expectUndoLabel(page, /Update transform/);
  await expect(page.getByText("(uniform ✓)")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText(/max error/)).toHaveCount(0);
});

test("Map tab: manual per-page mode shows the page selector for multi-page maps only", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.getByLabel("Top-left X")).toBeVisible({ timeout: 10_000 });
  const info = await page.getByText(/· \d+ pages? ·/).innerText();
  const pages = Number(/(\d+) pages?/.exec(info)?.[1] ?? "1");
  if (pages < 2) {
    await expect(page.getByText("Multi-page transformation")).toHaveCount(0);
    return;
  }
  await page.locator("#page-transform-mode").click();
  await page.getByRole("option", { name: /Manual/ }).click();
  await expect(page.getByText(new RegExp(`Page 1/${pages}`))).toBeVisible();
});

test("Event tab: a remote event image from an opened file loads only after a click", async ({ page }) => {
  const remoteRequests: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://localhost") && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) remoteRequests.push(r.url());
  });
  await loadExample(page); // the example has an https event image
  await page.getByRole("tab", { name: "Event", exact: true }).click();
  const show = page.getByRole("button", { name: /Show image from / });
  await expect(show).toBeVisible();
  await expect(page.locator('img[alt="Event preview"]')).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
  await show.click();
  await expect(page.locator('img[alt="Event preview"]')).toHaveCount(1);
});

test("Course Setting: several quick arrow-key nudges undo as one step", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("button", { name: /^Course Setting$/ }).click();
  const rowButtons = page.locator('button[title^="Map exchange:"]');
  if ((await rowButtons.count()) === 0) {
    await page.locator('button[role="combobox"]').first().click();
    await page.getByRole("option").first().click();
  }
  await expect(rowButtons.first()).toBeVisible({ timeout: 10_000 });
  await page.locator("tr", { has: rowButtons.first() }).first().click();
  const x = page.getByLabel("X coordinate (mm)");
  const original = Number(await x.inputValue());

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  // The first nudge only lands once the map has rendered; then two more in quick succession
  await expect(async () => {
    await page.keyboard.press("Shift+ArrowRight");
    expect(Number(await x.inputValue())).toBeGreaterThan(original);
  }).toPass({ timeout: 10_000, intervals: [100] });
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expectUndoLabel(page, /Move control/);

  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => Number(await x.inputValue())).toBeCloseTo(original, 2);
});

test("Confirmations use the app's own dialog (no native confirm), and Cancel keeps things as they are", async ({ page }) => {
  let nativeDialogs = 0;
  page.on("dialog", async (d) => {
    nativeDialogs++;
    await d.dismiss();
  });
  await page.goto("/");
  await openSettings(page);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Clear the map cache?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Clear" }).click();
  await expect(page.getByText("0.00 MB used")).toBeVisible();
  expect(nativeDialogs).toBe(0);
});

test("Map tab: measure shows a distance; calculate-scale sets the map scale (undoable)", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  const scale = page.locator("#map-scale");
  await expect(scale).toHaveValue("400", { timeout: 10_000 });
  await page.waitForTimeout(1500); // PDF render
  const viewer = page.locator("canvas").first();
  const box = (await viewer.boundingBox())!;
  const drag = async () => {
    // The map canvas can be larger than the viewport: stay inside its visible top-left part
    const x = box.x + 150;
    const y = box.y + 150;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 60, y, { steps: 5 });
    await page.mouse.move(x + 120, y, { steps: 5 });
    await page.mouse.up();
  };

  await page.getByRole("button", { name: "Measure distance" }).click();
  await drag();
  await expect(page.locator("svg text", { hasText: /^\d+\.\d m$/ })).toBeVisible();

  await page.getByRole("button", { name: "Calculate scale from distance" }).click();
  await drag();
  await expect(scale).not.toHaveValue("400");
  expect(Number(await scale.inputValue())).toBeGreaterThan(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(scale).toHaveValue("400");
});

test("Georeference tab: map latitude/longitude moved out of the Map tab", async ({ page }) => {
  await loadExample(page);
  await page.getByRole("tab", { name: "Map", exact: true }).click();
  await expect(page.getByLabel("Top-left X")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByLabel("Latitude")).toHaveCount(0);
  await page.getByRole("tab", { name: "Georeference", exact: true }).click();
  const lat = page.getByLabel("Latitude");
  await expect(lat).toBeVisible();
  await lat.fill("59.9");
  await lat.press("Enter");
  await expect(lat).toHaveValue("59.9");
  await expectUndoLabel(page, /Edit georeferencing/);
});

test("Course Setting is a feature flag: on by default, hidden when turned off", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Course Setting$/ })).toBeVisible();
  await page.evaluate(() => localStorage.setItem("feature-flags", JSON.stringify({ courseSetting: false })));
  await page.reload();
  await expect(page.getByRole("button", { name: /^Event$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Course Setting$/ })).toHaveCount(0);
});
