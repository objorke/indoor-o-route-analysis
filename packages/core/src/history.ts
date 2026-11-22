/**
 * Framework-free undo/redo history (planning/10-undo-redo.md).
 *
 * `past` holds the states *before* each recorded change (newest last);
 * `future` holds the states *after* each undone change (next redo last).
 * The present state lives outside the history (in the app's store).
 *
 * Rapid changes with the same label/groupKey (e.g. the mousemove writes of a
 * drag) are coalesced into one undo step.
 */
export interface HistoryEntry<T> {
  state: T;
  /** Describes the change, e.g. "Move control" (shown as "Undo Move control"). */
  label?: string;
  groupKey?: string;
  /** Time (ms) of the latest change merged into this entry. */
  time: number;
}

export interface HistoryState<T> {
  past: HistoryEntry<T>[];
  future: HistoryEntry<T>[];
  /** `past.length` at the last save, or null when the saved state is no longer reachable. */
  savedIndex: number | null;
}

export interface RecordOptions {
  label?: string;
  groupKey?: string;
  /** Current time in ms (injectable for tests). */
  now?: number;
  /** Changes within this many ms of the previous one, with the same label and groupKey, are merged. Default 500. */
  coalesceMs?: number;
  /** Maximum number of undo steps kept. Default 100. */
  limit?: number;
}

export const DEFAULT_COALESCE_MS = 500;
export const DEFAULT_HISTORY_LIMIT = 100;

export function createHistory<T>(): HistoryState<T> {
  return { past: [], future: [], savedIndex: 0 };
}

export const canUndo = <T>(h: HistoryState<T>) => h.past.length > 0;
export const canRedo = <T>(h: HistoryState<T>) => h.future.length > 0;
export const isSaved = <T>(h: HistoryState<T>) => h.savedIndex === h.past.length;
export const markSaved = <T>(h: HistoryState<T>): HistoryState<T> => ({ ...h, savedIndex: h.past.length });
export const undoLabel = <T>(h: HistoryState<T>) => h.past[h.past.length - 1]?.label;
export const redoLabel = <T>(h: HistoryState<T>) => h.future[h.future.length - 1]?.label;

/** Record a change; `before` is the state before it. Clears the redo stack. */
export function recordChange<T>(h: HistoryState<T>, before: T, options: RecordOptions = {}): HistoryState<T> {
  const now = options.now ?? Date.now();
  const coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
  const limit = Math.max(1, options.limit ?? DEFAULT_HISTORY_LIMIT);
  const last = h.past[h.past.length - 1];

  const canCoalesce =
    last !== undefined &&
    h.future.length === 0 &&
    !isSaved(h) && // never merge an edit into a saved state: undo must be able to get back to it
    now - last.time <= coalesceMs &&
    last.label === options.label &&
    last.groupKey === options.groupKey;
  if (canCoalesce) {
    const past = [...h.past];
    past[past.length - 1] = { ...last, time: now };
    return { ...h, past };
  }

  // The saved state was in the redo stack, which is now discarded
  let savedIndex = h.savedIndex !== null && h.savedIndex > h.past.length ? null : h.savedIndex;
  let past = [...h.past, { state: before, label: options.label, groupKey: options.groupKey, time: now }];
  if (past.length > limit) {
    const drop = past.length - limit;
    past = past.slice(drop);
    savedIndex = savedIndex === null || savedIndex - drop < 0 ? null : savedIndex - drop;
  }
  return { past, future: [], savedIndex };
}

/** Undo: returns the state to restore and the new history, or null when there is nothing to undo. */
export function undo<T>(h: HistoryState<T>, present: T): { state: T; history: HistoryState<T> } | null {
  const entry = h.past[h.past.length - 1];
  if (!entry) return null;
  return {
    state: entry.state,
    history: {
      past: h.past.slice(0, -1),
      future: [...h.future, { ...entry, state: present }],
      savedIndex: h.savedIndex,
    },
  };
}

/** Redo: returns the state to restore and the new history, or null when there is nothing to redo. */
export function redo<T>(h: HistoryState<T>, present: T): { state: T; history: HistoryState<T> } | null {
  const entry = h.future[h.future.length - 1];
  if (!entry) return null;
  return {
    state: entry.state,
    history: {
      past: [...h.past, { ...entry, state: present }],
      future: h.future.slice(0, -1),
      savedIndex: h.savedIndex,
    },
  };
}

/**
 * Drop the oldest undo steps while `tooMany(history)` is true (e.g. to cap how
 * many large PDF buffers the history keeps alive).
 */
export function dropOldestWhile<T>(h: HistoryState<T>, tooMany: (h: HistoryState<T>) => boolean): HistoryState<T> {
  let current = h;
  while (current.past.length > 0 && tooMany(current)) {
    current = {
      ...current,
      past: current.past.slice(1),
      savedIndex: current.savedIndex === null || current.savedIndex - 1 < 0 ? null : current.savedIndex - 1,
    };
  }
  return current;
}
