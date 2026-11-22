import { describe, it, expect } from "vitest";
import { applyTheme, isThemeMode, THEME_MODES, DEFAULT_THEME } from "./settings-context";

describe("theme helpers", () => {
  it("recognises the three theme modes only", () => {
    expect(THEME_MODES).toEqual(["light", "medium", "dark"]);
    for (const m of THEME_MODES) expect(isThemeMode(m)).toBe(true);
    expect(isThemeMode("neon")).toBe(false);
    expect(isThemeMode(null)).toBe(false);
    expect(DEFAULT_THEME).toBe("dark");
  });

  it("sets data-theme, the dark class and color-scheme", () => {
    const el = document.createElement("html");
    applyTheme("light", el);
    expect(el.dataset.theme).toBe("light");
    expect(el.classList.contains("dark")).toBe(false);
    expect(el.style.colorScheme).toBe("light");

    applyTheme("medium", el);
    expect(el.dataset.theme).toBe("medium");
    expect(el.classList.contains("dark")).toBe(true);
    expect(el.style.colorScheme).toBe("dark");

    applyTheme("dark", el);
    expect(el.dataset.theme).toBe("dark");
    expect(el.classList.contains("dark")).toBe(true);
  });
});
