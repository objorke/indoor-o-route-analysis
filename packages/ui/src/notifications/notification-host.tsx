"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { Button } from "../components/ui/button";
import { noticeStore, type NoticeStore, type Notice } from "./notice-store";

const AUTO_DISMISS_MS: Record<Notice["kind"], number> = { info: 6000, success: 4000, error: 10000 };

function Toast({ notice, store }: { notice: Notice; store: NoticeStore }) {
  useEffect(() => {
    const t = setTimeout(() => store.dismiss(notice.id), AUTO_DISMISS_MS[notice.kind]);
    return () => clearTimeout(t);
  }, [notice, store]);
  const Icon = notice.kind === "error" ? AlertCircle : notice.kind === "success" ? CheckCircle2 : Info;
  const tone =
    notice.kind === "error" ? "text-destructive" : notice.kind === "success" ? "text-green-500" : "text-primary";
  return (
    <div
      role={notice.kind === "error" ? "alert" : "status"}
      className="pointer-events-auto flex items-start gap-2 rounded-md border border-border bg-card text-card-foreground shadow-lg px-3 py-2 text-sm max-w-md"
    >
      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${tone}`} />
      <div className="flex-1 min-w-0">
        {notice.title && <div className="font-medium">{notice.title}</div>}
        <div className="whitespace-pre-line break-words">{notice.message}</div>
      </div>
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground"
        aria-label="Dismiss"
        onClick={() => store.dismiss(notice.id)}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** Renders app notifications (toasts) and the confirmation dialog. Mount once, in the app shell. */
export function NotificationHost({ store = noticeStore }: { store?: NoticeStore }) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const request = state.confirm;

  useEffect(() => {
    if (!request) return;
    confirmButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        store.answer(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [request, store]);

  return (
    <>
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2" aria-live="polite">
        {state.notices.map((n) => (
          <Toast key={n.id} notice={n} store={store} />
        ))}
      </div>
      {request && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            className="bg-background border border-border rounded-lg max-w-sm w-full mx-4 shadow-lg"
          >
            <div className="px-4 py-3 border-b border-border">
              <h3 id="confirm-title" className="text-md font-semibold">
                {request.title}
              </h3>
            </div>
            <p id="confirm-message" className="p-4 text-sm text-muted-foreground whitespace-pre-line">
              {request.message}
            </p>
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => store.answer(false)}>
                {request.cancelLabel}
              </Button>
              <Button
                ref={confirmButton}
                variant={request.destructive ? "destructive" : "default"}
                size="sm"
                onClick={() => store.answer(true)}
              >
                {request.confirmLabel}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
