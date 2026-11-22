"use client"

import { useEffect } from "react";
import { useAppData } from "@indoor-o-route-analysis/ui";

/** True when keyboard focus is in a text field, where the browser's own undo applies. */
function isTextEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable;
}

/**
 * Global undo/redo shortcuts: Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z or Ctrl+Y redo.
 * Skipped while typing in a field (native text undo) or while a dialog is open.
 * Undo/Redo with the change's name are also in the File menu.
 */
export function useUndoRedoShortcuts() {
  const { undo, redo } = useAppData();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      if (isTextEditing(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || (key === "y" && e.ctrlKey && !e.shiftKey)) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);
}
