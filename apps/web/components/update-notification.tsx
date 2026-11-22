"use client";

import { useEffect } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@indoor-o-route-analysis/ui";
import { useServiceWorkerUpdate } from "@/lib/use-service-worker-update";

/**
 * Registers the service worker and, when a newer deployment is waiting, shows
 * a compact toast offering a reload. Mounted once from the root layout.
 *
 * Keyboard: Ctrl/Cmd+Shift+R applies a pending update (plain F5/Ctrl+R still
 * does a normal browser reload, which also picks the new version up).
 */
export default function UpdateNotification() {
  const { updateAvailable, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();

  useEffect(() => {
    if (!updateAvailable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        applyUpdate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [updateAvailable, applyUpdate]);

  if (!updateAvailable) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-[100] flex items-center gap-3 rounded-md border border-primary/50 bg-background px-3 py-2 text-xs shadow-lg"
    >
      <RefreshCw className="h-4 w-4 text-primary" aria-hidden="true" />
      <div className="flex flex-col">
        <span className="font-medium text-foreground">A new version is available</span>
        <span className="text-muted-foreground">Reload to update (Ctrl/Cmd+Shift+R)</span>
      </div>
      <Button
        variant="default"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={applyUpdate}
        title="Reload the app to load the new version"
      >
        Reload
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={dismissUpdate}
        title="Dismiss — the update is applied on the next reload"
        aria-label="Dismiss update notification"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
