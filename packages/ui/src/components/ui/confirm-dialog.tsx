"use client"

import { X } from "lucide-react";
import { Button } from "./button";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  onDiscard?: () => void; // Optional discard action
  confirmLabel?: string;
  cancelLabel?: string;
  discardLabel?: string;
}

export default function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  onDiscard,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  discardLabel = "Discard",
}: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="alertdialog" aria-modal="true" aria-label={title} className="bg-background border border-border rounded-lg max-w-sm w-full mx-4 shadow-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-md font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="p-4">
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
          <Button variant="outline" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          {onDiscard && (
            <Button variant="destructive" size="sm" onClick={onDiscard}>
              {discardLabel}
            </Button>
          )}
          <Button variant="default" size="sm" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
