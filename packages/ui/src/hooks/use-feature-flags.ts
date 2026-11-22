"use client"

import { useCallback, useSyncExternalStore } from "react";

export interface FeatureFlags {
  /** Course Setting view in the top bar. On by default. */
  courseSetting: boolean;
  routeBuilder: boolean;
  labs: boolean;
  modifyGraph: boolean;
  /** Directions view (ISInOM course directions) and the directions layer in the other map views. */
  directions: boolean;
}

const FEATURE_FLAGS_STORAGE_KEY = "feature-flags";

const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  courseSetting: true,
  routeBuilder: false,
  labs: false,
  modifyGraph: false,
  directions: false,
};

function loadFeatureFlags(): FeatureFlags {
  if (typeof window === "undefined") {
    return DEFAULT_FEATURE_FLAGS;
  }
  try {
    const stored = localStorage.getItem(FEATURE_FLAGS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_FEATURE_FLAGS,
        ...parsed,
      };
    }
  } catch (error) {
    console.error("Failed to load feature flags:", error);
  }
  return DEFAULT_FEATURE_FLAGS;
}

function saveFeatureFlags(flags: FeatureFlags): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    localStorage.setItem(FEATURE_FLAGS_STORAGE_KEY, JSON.stringify(flags));
  } catch (error) {
    console.error("Failed to save feature flags:", error);
  }
}

// Global state for feature flags to avoid re-reading localStorage on every render
let cachedFlags: FeatureFlags | null = null;
const listeners: Set<() => void> = new Set();

function getSnapshot(): FeatureFlags {
  if (cachedFlags === null) {
    cachedFlags = loadFeatureFlags();
  }
  return cachedFlags;
}

function getServerSnapshot(): FeatureFlags {
  return DEFAULT_FEATURE_FLAGS;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  listeners.forEach((listener) => listener());
}

/** Restore all feature flags to their defaults (and forget the stored value). */
export function resetFeatureFlags(): void {
  try {
    if (typeof window !== "undefined") localStorage.removeItem(FEATURE_FLAGS_STORAGE_KEY);
  } catch {
    // ignore
  }
  cachedFlags = DEFAULT_FEATURE_FLAGS;
  notifyListeners();
}

export function useFeatureFlags() {
  const flags = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const updateFlag = useCallback((key: keyof FeatureFlags, value: boolean) => {
    const updated = { ...getSnapshot(), [key]: value };
    cachedFlags = updated;
    saveFeatureFlags(updated);
    notifyListeners();
  }, []);

  const setFeatureFlags = useCallback((newFlags: Partial<FeatureFlags>) => {
    const updated = { ...getSnapshot(), ...newFlags };
    cachedFlags = updated;
    saveFeatureFlags(updated);
    notifyListeners();
  }, []);

  return {
    flags,
    updateFlag,
    setFeatureFlags,
    resetFeatureFlags,
  };
}
