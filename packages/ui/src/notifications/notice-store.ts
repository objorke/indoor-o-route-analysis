/**
 * App-wide notifications and confirmations, replacing window.alert/confirm
 * (which block the page, ignore the theme and can't be tested). A tiny store
 * with subscribers; <NotificationHost> renders it.
 */
export type NoticeKind = "info" | "success" | "error";

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
  title?: string;
}

export interface ConfirmRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive: boolean;
  resolve: (ok: boolean) => void;
}

export interface NoticeState {
  notices: Notice[];
  confirm: ConfirmRequest | null;
}

type Listener = (state: NoticeState) => void;

export function createNoticeStore() {
  let state: NoticeState = { notices: [], confirm: null };
  let nextId = 1;
  const queue: ConfirmRequest[] = [];
  const listeners = new Set<Listener>();
  const emit = () => {
    for (const l of listeners) l(state);
  };
  const set = (next: NoticeState) => {
    state = next;
    emit();
  };

  return {
    getState: () => state,
    subscribe(listener: Listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(message: string, options: { kind?: NoticeKind; title?: string } = {}): number {
      const notice: Notice = { id: nextId++, kind: options.kind ?? "info", message, title: options.title };
      // Keep the latest few
      set({ ...state, notices: [...state.notices, notice].slice(-4) });
      return notice.id;
    },
    dismiss(id: number) {
      set({ ...state, notices: state.notices.filter((n) => n.id !== id) });
    },
    confirm(
      message: string,
      options: { title?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean } = {},
    ): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        const request: ConfirmRequest = {
          id: nextId++,
          title: options.title ?? "Confirm",
          message,
          confirmLabel: options.confirmLabel ?? "OK",
          cancelLabel: options.cancelLabel ?? "Cancel",
          destructive: options.destructive ?? false,
          resolve,
        };
        if (state.confirm) queue.push(request);
        else set({ ...state, confirm: request });
      });
    },
    /** Answer the open confirmation and show the next queued one. */
    answer(ok: boolean) {
      const current = state.confirm;
      if (!current) return;
      set({ ...state, confirm: queue.shift() ?? null });
      current.resolve(ok);
    },
  };
}

export type NoticeStore = ReturnType<typeof createNoticeStore>;

/** The app's shared store. */
export const noticeStore = createNoticeStore();

/** Non-blocking message (replaces `alert`). */
export const notify = (message: string, options?: { kind?: NoticeKind; title?: string }) =>
  noticeStore.notify(message, options);

/** Themed confirmation dialog (replaces `confirm`); resolves true when confirmed. */
export const confirmAction = (
  message: string,
  options?: { title?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean },
) => noticeStore.confirm(message, options);
