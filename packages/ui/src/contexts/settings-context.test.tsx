import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { DEFAULT_EXAMPLE_REPOSITORY_URL, DEFAULT_ROUTE_ENUMERATION_ALGORITHM } from "@indoor-o-route-analysis/core";
import { SettingsProvider, useSettings } from "./settings-context";

const STORAGE_KEYS = {
  PERSIST_DB: "app-persist-db",
  RUNNING_SPEED: "app-running-speed",
  ROUTE_ANALYSIS_K: "app-route-analysis-k",
  ROUTE_ENUMERATION_ALGORITHM: "app-route-enumeration-algorithm",
};

function wrapper({ children }: { children: React.ReactNode }) {
  return <SettingsProvider>{children}</SettingsProvider>;
}

describe("useSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("throws when used outside SettingsProvider", () => {
    // Suppress the expected React error log for this negative test.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSettings())).toThrow(
      "useSettings must be used within SettingsProvider"
    );
    spy.mockRestore();
  });

  it("defaults to runningSpeed=3.0, routeAnalysisK=6, persistToDB=true when localStorage is empty", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.runningSpeed).toBe(3.0);
    expect(result.current.routeAnalysisK).toBe(6);
    expect(result.current.persistToDB).toBe(true);
  });

  it("defaults the route enumeration algorithm to the core default", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.routeEnumerationAlgorithm).toBe(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
  });

  it("loads persisted values from localStorage on mount", () => {
    localStorage.setItem(STORAGE_KEYS.PERSIST_DB, "false");
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, "4.5");
    localStorage.setItem(STORAGE_KEYS.ROUTE_ANALYSIS_K, "10");
    localStorage.setItem(STORAGE_KEYS.ROUTE_ENUMERATION_ALGORITHM, "dfs");

    const { result } = renderHook(() => useSettings(), { wrapper });

    expect(result.current.persistToDB).toBe(false);
    expect(result.current.runningSpeed).toBe(4.5);
    expect(result.current.routeAnalysisK).toBe(10);
    expect(result.current.routeEnumerationAlgorithm).toBe("dfs");
  });

  it("ignores an unknown persisted route enumeration algorithm", () => {
    localStorage.setItem(STORAGE_KEYS.ROUTE_ENUMERATION_ALGORITHM, "teleport");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.routeEnumerationAlgorithm).toBe(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
  });

  it("ignores invalid persisted runningSpeed and falls back to default", () => {
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, "not-a-number");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.runningSpeed).toBe(3.0);
  });

  it("ignores non-positive persisted runningSpeed and falls back to default", () => {
    localStorage.setItem(STORAGE_KEYS.RUNNING_SPEED, "-1");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.runningSpeed).toBe(3.0);
  });

  it("ignores out-of-range persisted routeAnalysisK and falls back to default", () => {
    localStorage.setItem(STORAGE_KEYS.ROUTE_ANALYSIS_K, "0");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.routeAnalysisK).toBe(6);
  });

  it("setPersistToDB updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setPersistToDB(false));

    expect(result.current.persistToDB).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.PERSIST_DB)).toBe("false");
  });

  it("setRunningSpeed updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setRunningSpeed(5.25));

    expect(result.current.runningSpeed).toBe(5.25);
    expect(localStorage.getItem(STORAGE_KEYS.RUNNING_SPEED)).toBe("5.25");
  });

  it("setRouteAnalysisK updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setRouteAnalysisK(12));

    expect(result.current.routeAnalysisK).toBe(12);
    expect(localStorage.getItem(STORAGE_KEYS.ROUTE_ANALYSIS_K)).toBe("12");
  });

  it("setRouteEnumerationAlgorithm updates state and persists to localStorage", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });

    act(() => result.current.setRouteEnumerationAlgorithm("bfs"));

    expect(result.current.routeEnumerationAlgorithm).toBe("bfs");
    expect(localStorage.getItem(STORAGE_KEYS.ROUTE_ENUMERATION_ALGORITHM)).toBe("bfs");
  });

  it("defaults the theme to dark and applies it to the document", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.theme).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("persists and applies a selected theme", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    act(() => result.current.setTheme("light"));
    expect(localStorage.getItem("app-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    act(() => result.current.setTheme("medium"));
    expect(document.documentElement.dataset.theme).toBe("medium");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("restores a saved theme and ignores invalid values", () => {
    localStorage.setItem("app-theme", "medium");
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.theme).toBe("medium");
    localStorage.setItem("app-theme", "neon");
    const { result: r2 } = renderHook(() => useSettings(), { wrapper });
    expect(r2.current.theme).toBe("dark");
  });
});

describe("useSettings with unavailable storage", () => {
  it("keeps working in memory when localStorage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    try {
      const { result } = renderHook(() => useSettings(), { wrapper });
      expect(result.current.runningSpeed).toBe(3.0);
      act(() => result.current.setRunningSpeed(4));
      expect(result.current.runningSpeed).toBe(4);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});

describe("example repositories setting", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to the default repository", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.exampleRepositories).toEqual([DEFAULT_EXAMPLE_REPOSITORY_URL]);
  });

  it("sets, de-duplicates and persists repositories", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    act(() =>
      result.current.setExampleRepositories([
        DEFAULT_EXAMPLE_REPOSITORY_URL,
        "https://example.org/index.json",
        " https://example.org/index.json ",
        "not a url",
      ]),
    );
    expect(result.current.exampleRepositories).toEqual([DEFAULT_EXAMPLE_REPOSITORY_URL, "https://example.org/index.json"]);
    expect(JSON.parse(localStorage.getItem("app-example-repositories")!)).toEqual([
      DEFAULT_EXAMPLE_REPOSITORY_URL,
      "https://example.org/index.json",
    ]);
  });

  it("allows removing the default repository (empty list persists)", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    act(() => result.current.setExampleRepositories([]));
    expect(result.current.exampleRepositories).toEqual([]);
    const { result: r2 } = renderHook(() => useSettings(), { wrapper });
    expect(r2.current.exampleRepositories).toEqual([]);
  });

  it("loads persisted repositories and ignores corrupt values", () => {
    localStorage.setItem("app-example-repositories", JSON.stringify(["https://a.org/index.json", 5, "javascript:x"]));
    const { result } = renderHook(() => useSettings(), { wrapper });
    expect(result.current.exampleRepositories).toEqual(["https://a.org/index.json"]);

    localStorage.setItem("app-example-repositories", "{not json");
    const { result: r2 } = renderHook(() => useSettings(), { wrapper });
    expect(r2.current.exampleRepositories).toEqual([DEFAULT_EXAMPLE_REPOSITORY_URL]);
  });
});

describe("resetSettings", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores all defaults and removes stored values", () => {
    const { result } = renderHook(() => useSettings(), { wrapper });
    act(() => {
      result.current.setRunningSpeed(5);
      result.current.setRouteAnalysisK(20);
      result.current.setPersistToDB(false);
      result.current.setShowControlPoints(true);
      result.current.setTheme("light");
      result.current.setExampleRepositories([]);
    });
    act(() => result.current.resetSettings());
    expect(result.current.runningSpeed).toBe(3.0);
    expect(result.current.routeAnalysisK).toBe(6);
    expect(result.current.persistToDB).toBe(true);
    expect(result.current.showControlPoints).toBe(false);
    expect(result.current.theme).toBe("dark");
    expect(result.current.routeEnumerationAlgorithm).toBe(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
    expect(result.current.exampleRepositories).toEqual([DEFAULT_EXAMPLE_REPOSITORY_URL]);
    expect(localStorage.getItem("app-running-speed")).toBeNull();
    expect(localStorage.getItem("app-example-repositories")).toBeNull();
  });
});
