"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Registers the service worker and reports when a newer deployment is waiting
 * to take over, so the app can offer a reload instead of silently serving
 * stale assets (see scripts/sw-template.js for the worker side).
 *
 * The flow, in browser terms:
 *  - `register()` installs /sw.js. When its bytes change (the build id is
 *    stamped in at build time) the browser installs the new worker and parks
 *    it in `registration.waiting`, because the worker no longer calls
 *    skipWaiting() on install. The running page keeps the assets it started
 *    with, which matters for Next.js chunk hashes.
 *  - We surface that as `updateAvailable`.
 *  - `applyUpdate()` posts SKIP_WAITING; the worker activates, fires
 *    `controllerchange`, and we reload once (guarded against reload loops).
 *  - Updates are re-checked periodically and whenever the tab becomes
 *    visible again, which is what makes an installed (home-screen) PWA pick
 *    up a deploy without being force-closed.
 *
 * Everything is local to the browser — no version data is sent anywhere.
 */

export interface ServiceWorkerUpdateState {
  /** True when a newer version has installed and is waiting to activate. */
  updateAvailable: boolean;
  /** Activate the waiting worker and reload the page. */
  applyUpdate: () => void;
  /** Hide the notification until the next update is found. */
  dismissUpdate: () => void;
}

export interface ServiceWorkerUpdateOptions {
  /** Path of the generated worker. */
  swUrl?: string;
  /** How often to poll for a new deployment, in ms (default 60 s). */
  checkIntervalMs?: number;
  /** Register even outside production builds — used by tests. */
  enabled?: boolean;
}

const DEFAULT_CHECK_INTERVAL_MS = 60_000;

export function useServiceWorkerUpdate(options: ServiceWorkerUpdateOptions = {}): ServiceWorkerUpdateState {
  const {
    swUrl = "/sw.js",
    checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
    enabled = process.env.NODE_ENV === "production",
  } = options;

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const reloadingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    // `"serviceWorker" in navigator` is not enough: the property can exist and
    // be undefined (older browsers, insecure origins, test doubles).
    if (typeof navigator === "undefined" || !navigator.serviceWorker) return;

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let registration: ServiceWorkerRegistration | null = null;

    // On a first visit the worker installs and calls clients.claim(), which
    // also fires 'controllerchange'. That is not an update, so only treat the
    // event as one when this page was already controlled when it loaded.
    const hadControllerAtStart = !!navigator.serviceWorker.controller;

    const markWaiting = (worker: ServiceWorker | null) => {
      if (cancelled || !worker) return;
      waitingWorkerRef.current = worker;
      setUpdateAvailable(true);
    };

    // A worker is only an *update* if this page is already controlled by one;
    // on a first visit the freshly installed worker is simply the current one.
    const trackInstalling = (worker: ServiceWorker | null) => {
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) {
          markWaiting(worker);
        }
      });
    };

    const onControllerChange = () => {
      if (!hadControllerAtStart) return;
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    const checkForUpdate = () => {
      registration?.update().catch(() => {
        /* offline or the check failed — try again on the next tick */
      });
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkForUpdate();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        if (cancelled) return;
        registration = reg;

        // An update may already be waiting from a previous visit.
        if (reg.waiting && navigator.serviceWorker.controller) markWaiting(reg.waiting);
        trackInstalling(reg.installing);
        reg.addEventListener("updatefound", () => trackInstalling(reg.installing));

        interval = setInterval(checkForUpdate, checkIntervalMs);
        document.addEventListener("visibilitychange", onVisibilityChange);
      })
      .catch((error) => {
        console.warn("Service Worker registration failed:", error);
      });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [enabled, swUrl, checkIntervalMs]);

  const applyUpdate = useCallback(() => {
    const waiting = waitingWorkerRef.current;
    if (!waiting) {
      window.location.reload();
      return;
    }
    // The worker activates and fires controllerchange, which reloads the page.
    waiting.postMessage({ type: "SKIP_WAITING" });
    setUpdateAvailable(false);
  }, []);

  const dismissUpdate = useCallback(() => setUpdateAvailable(false), []);

  return { updateAvailable, applyUpdate, dismissUpdate };
}
