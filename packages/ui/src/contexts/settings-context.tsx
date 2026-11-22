"use client"

import React, { createContext, useContext, useState, useEffect, useLayoutEffect, useCallback } from "react";
import {
  DEFAULT_EXAMPLE_REPOSITORY_URL,
  DEFAULT_ROUTE_ENUMERATION_ALGORITHM,
  normalizeRepositoryUrl,
  isRouteEnumerationAlgorithm,
  type RouteEnumerationAlgorithm,
} from "@indoor-o-route-analysis/core";

/** UI color theme. "dark" is the default (dark theme with purple selection). */
export type ThemeMode = "light" | "medium" | "dark";
export const THEME_MODES: readonly ThemeMode[] = ["light", "medium", "dark"];
export const DEFAULT_THEME: ThemeMode = "dark";
export const THEME_STORAGE_KEY = "app-theme";

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

/**
 * Apply a theme to the document: sets `data-theme` on <html> (selects the CSS
 * palette in globals.css) and toggles the `dark` class (Tailwind `dark:`
 * variants) for the two dark-ish themes.
 */
export function applyTheme(theme: ThemeMode, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = theme;
  root.classList.toggle("dark", theme !== "light");
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

interface SettingsContextType {
  // UI color theme
  theme: ThemeMode;
  setTheme: (value: ThemeMode) => void;

  // Draw a dot at the exact centre of each control circle (all map views)
  showControlPoints: boolean;
  setShowControlPoints: (value: boolean) => void;

  // Storage Persistence Setting
  persistToDB: boolean;
  setPersistToDB: (value: boolean) => void;

  // Running Speed for Analysis (m/s)
  runningSpeed: number;
  setRunningSpeed: (value: number) => void;

  // Route Analysis k value (max alternative routes)
  routeAnalysisK: number;
  setRouteAnalysisK: (value: number) => void;

  // Algorithm used by "Show all routes" in Route Analysis
  routeEnumerationAlgorithm: RouteEnumerationAlgorithm;
  setRouteEnumerationAlgorithm: (value: RouteEnumerationAlgorithm) => void;

  // Example repositories (index.json URLs) for File → Examples. Defaults to
  // DEFAULT_EXAMPLE_REPOSITORIES; every entry (including the default) can be removed.
  exampleRepositories: string[];
  setExampleRepositories: (urls: string[]) => void;

  /** Restore every setting in this context to its default value. */
  resetSettings: () => void;
}

/** Repositories listed when the user hasn't changed the list. */
export const DEFAULT_EXAMPLE_REPOSITORIES: readonly string[] = [DEFAULT_EXAMPLE_REPOSITORY_URL];

const SettingsContext = createContext<SettingsContextType | null>(null);

/** localStorage can throw (private mode, blocked site data); settings then just aren't remembered. */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // keep the in-memory value
  }
}

// Runs before paint on the client (no flash of default values); plain effect on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Local storage keys
const STORAGE_KEYS = {
  PERSIST_DB: "app-persist-db",
  RUNNING_SPEED: "app-running-speed",
  ROUTE_ANALYSIS_K: "app-route-analysis-k",
  ROUTE_ENUMERATION_ALGORITHM: "app-route-enumeration-algorithm",
  THEME: THEME_STORAGE_KEY,
  SHOW_CONTROL_POINTS: "app-show-control-points",
  EXAMPLE_REPOSITORIES: "app-example-repositories",
};

/** Validate, normalize and de-duplicate repository URLs. */
export function sanitizeExampleRepositories(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  const out: string[] = [];
  for (const u of urls) {
    if (typeof u !== "string") continue;
    const n = normalizeRepositoryUrl(u);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  // UI theme
  // Read synchronously so the first applyTheme() doesn't flash the default theme
  // over the one the inline <head> script already applied (see apps/web/app/layout.tsx).
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    const saved = readStored(THEME_STORAGE_KEY);
    return isThemeMode(saved) ? saved : DEFAULT_THEME;
  });
  // Control centre dots
  const [showControlPoints, setShowControlPointsState] = useState(false);
  // Persistence setting
  const [persistToDB, setPersistToDBState] = useState(true);
  // Running speed (m/s), default approx 6 min/km (2.78 m/s) -> let's use 3.33 m/s (5 min/km) as default or simply 3.0
  const [runningSpeed, setRunningSpeedState] = useState(3.0);
  // Route analysis k value (max alternative routes per leg)
  const [routeAnalysisK, setRouteAnalysisKState] = useState(6);
  // "Show all routes" enumeration algorithm
  const [routeEnumerationAlgorithm, setRouteEnumerationAlgorithmState] =
    useState<RouteEnumerationAlgorithm>(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
  // Example repositories
  const [exampleRepositories, setExampleRepositoriesState] = useState<string[]>([...DEFAULT_EXAMPLE_REPOSITORIES]);

  // Load saved settings before the first paint. (Not in useState initialisers: the app shell is
  // pre-rendered, and reading storage during render would make hydration mismatch.)
  useIsomorphicLayoutEffect(() => {
    const saved = readStored(STORAGE_KEYS.PERSIST_DB);
    if (saved !== null) {
      setPersistToDBState(saved === "true");
    }
    const savedSpeed = readStored(STORAGE_KEYS.RUNNING_SPEED);
    if (savedSpeed !== null) {
      const parsed = parseFloat(savedSpeed);
      if (!isNaN(parsed) && parsed > 0) {
        setRunningSpeedState(parsed);
      }
    }
    const savedK = readStored(STORAGE_KEYS.ROUTE_ANALYSIS_K);
    if (savedK !== null) {
      const parsed = parseInt(savedK, 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 1000) {
        setRouteAnalysisKState(parsed);
      }
    }
    setShowControlPointsState(readStored(STORAGE_KEYS.SHOW_CONTROL_POINTS) === "true");
    const savedAlgorithm = readStored(STORAGE_KEYS.ROUTE_ENUMERATION_ALGORITHM);
    if (isRouteEnumerationAlgorithm(savedAlgorithm)) {
      setRouteEnumerationAlgorithmState(savedAlgorithm);
    }
    const savedRepos = readStored(STORAGE_KEYS.EXAMPLE_REPOSITORIES);
    if (savedRepos !== null) {
      try {
        setExampleRepositoriesState(sanitizeExampleRepositories(JSON.parse(savedRepos)));
      } catch {
        // ignore corrupt value
      }
    }
  }, []);

  // Keep the document in sync with the selected theme
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((value: ThemeMode) => {
    setThemeState(value);
    writeStored(STORAGE_KEYS.THEME, value);
  }, []);

  const setShowControlPoints = useCallback((value: boolean) => {
    setShowControlPointsState(value);
    writeStored(STORAGE_KEYS.SHOW_CONTROL_POINTS, String(value));
  }, []);

  const setPersistToDB = useCallback((value: boolean) => {
    setPersistToDBState(value);
    writeStored(STORAGE_KEYS.PERSIST_DB, String(value));
  }, []);

  const setRunningSpeed = useCallback((value: number) => {
    setRunningSpeedState(value);
    writeStored(STORAGE_KEYS.RUNNING_SPEED, String(value));
  }, []);

  const setRouteAnalysisK = useCallback((value: number) => {
    setRouteAnalysisKState(value);
    writeStored(STORAGE_KEYS.ROUTE_ANALYSIS_K, String(value));
  }, []);

  const setRouteEnumerationAlgorithm = useCallback((value: RouteEnumerationAlgorithm) => {
    setRouteEnumerationAlgorithmState(value);
    writeStored(STORAGE_KEYS.ROUTE_ENUMERATION_ALGORITHM, value);
  }, []);

  const setExampleRepositories = useCallback((urls: string[]) => {
    const clean = sanitizeExampleRepositories(urls);
    setExampleRepositoriesState(clean);
    writeStored(STORAGE_KEYS.EXAMPLE_REPOSITORIES, JSON.stringify(clean));
  }, []);

  const resetSettings = useCallback(() => {
    for (const key of Object.values(STORAGE_KEYS)) {
      try {
        localStorage.removeItem(key);
      } catch {
        // storage unavailable: in-memory reset below still applies
      }
    }
    setThemeState(DEFAULT_THEME);
    setShowControlPointsState(false);
    setPersistToDBState(true);
    setRunningSpeedState(3.0);
    setRouteAnalysisKState(6);
    setRouteEnumerationAlgorithmState(DEFAULT_ROUTE_ENUMERATION_ALGORITHM);
    setExampleRepositoriesState([...DEFAULT_EXAMPLE_REPOSITORIES]);
  }, []);

  const value: SettingsContextType = {
    theme,
    setTheme,

    showControlPoints,
    setShowControlPoints,

    persistToDB,
    setPersistToDB,

    runningSpeed,
    setRunningSpeed,

    routeAnalysisK,
    setRouteAnalysisK,

    routeEnumerationAlgorithm,
    setRouteEnumerationAlgorithm,

    exampleRepositories,
    setExampleRepositories,

    resetSettings,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error("useSettings must be used within SettingsProvider")
  }
  return context
}
