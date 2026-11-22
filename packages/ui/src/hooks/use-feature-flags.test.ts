import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const STORAGE_KEY = "feature-flags";

/**
 * Re-imports the hook module fresh so its module-level `cachedFlags`/
 * `listeners` singleton state (intentional — it exists to avoid re-reading
 * localStorage on every render across the whole app) doesn't leak between
 * test cases.
 */
async function freshHook() {
  vi.resetModules();
  const mod = await import("./use-feature-flags");
  return mod.useFeatureFlags;
}

describe("useFeatureFlags", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to all flags false when localStorage is empty", async () => {
    const useFeatureFlags = await freshHook();
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags).toEqual({ courseSetting: true, routeBuilder: false, labs: false, modifyGraph: false, directions: false });
  });

  it("loads persisted flags from localStorage on first use", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ routeBuilder: true }));
    const useFeatureFlags = await freshHook();
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags).toEqual({ courseSetting: true, routeBuilder: true, labs: false, modifyGraph: false, directions: false });
  });

  it("falls back to defaults when localStorage holds malformed JSON", async () => {
    localStorage.setItem(STORAGE_KEY, "{not valid json");
    const useFeatureFlags = await freshHook();
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.flags).toEqual({ courseSetting: true, routeBuilder: false, labs: false, modifyGraph: false, directions: false });
  });

  it("updateFlag sets a single flag and persists it", async () => {
    const useFeatureFlags = await freshHook();
    const { result } = renderHook(() => useFeatureFlags());

    act(() => result.current.updateFlag("labs", true));

    expect(result.current.flags.labs).toBe(true);
    expect(result.current.flags.routeBuilder).toBe(false);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual({
      courseSetting: true,
      routeBuilder: false,
      labs: true,
      modifyGraph: false,
      directions: false,
    });
  });

  it("setFeatureFlags merges a partial update", async () => {
    const useFeatureFlags = await freshHook();
    const { result } = renderHook(() => useFeatureFlags());

    act(() => result.current.setFeatureFlags({ routeBuilder: true, modifyGraph: true }));

    expect(result.current.flags).toEqual({ courseSetting: true, routeBuilder: true, labs: false, modifyGraph: true, directions: false });
  });

  it("keeps multiple hook instances in sync via the listener notification", async () => {
    const useFeatureFlags = await freshHook();
    const a = renderHook(() => useFeatureFlags());
    const b = renderHook(() => useFeatureFlags());

    act(() => a.result.current.updateFlag("modifyGraph", true));

    expect(a.result.current.flags.modifyGraph).toBe(true);
    expect(b.result.current.flags.modifyGraph).toBe(true);
  });

  it("updateFlag builds on the current cached value, not a stale snapshot", async () => {
    const useFeatureFlags = await freshHook();
    const { result } = renderHook(() => useFeatureFlags());

    act(() => result.current.updateFlag("labs", true));
    act(() => result.current.updateFlag("routeBuilder", true));

    // The second update must not clobber the first.
    expect(result.current.flags).toEqual({ courseSetting: true, routeBuilder: true, labs: true, modifyGraph: false, directions: false });
  });
});
