import { describe, it, expect } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  dropOldestWhile,
  isSaved,
  markSaved,
  recordChange,
  redo,
  redoLabel,
  undo,
  undoLabel,
  type HistoryState,
} from "./history";

/** Small store driving the history like the app does. */
function store(initial: string) {
  let present = initial;
  let h: HistoryState<string> = createHistory();
  let t = 0;
  return {
    change(next: string, opts: { label?: string; groupKey?: string; dt?: number } = {}) {
      t += opts.dt ?? 1000;
      h = recordChange(h, present, { label: opts.label, groupKey: opts.groupKey, now: t });
      present = next;
    },
    undo() {
      const r = undo(h, present);
      if (r) ({ state: present, history: h } = r);
    },
    redo() {
      const r = redo(h, present);
      if (r) ({ state: present, history: h } = r);
    },
    save() {
      h = markSaved(h);
    },
    get present() {
      return present;
    },
    get h() {
      return h;
    },
  };
}

describe("history", () => {
  it("undoes and redoes in order", () => {
    const s = store("a");
    s.change("b");
    s.change("c");
    expect(canUndo(s.h)).toBe(true);
    s.undo();
    expect(s.present).toBe("b");
    s.undo();
    expect(s.present).toBe("a");
    expect(canUndo(s.h)).toBe(false);
    s.redo();
    s.redo();
    expect(s.present).toBe("c");
    expect(canRedo(s.h)).toBe(false);
  });

  it("a new change clears the redo stack", () => {
    const s = store("a");
    s.change("b");
    s.undo();
    s.change("x");
    expect(canRedo(s.h)).toBe(false);
    s.undo();
    expect(s.present).toBe("a");
  });

  it("coalesces rapid changes with the same label/groupKey into one step", () => {
    const s = store("p0");
    s.change("p1", { label: "Move", dt: 1000 });
    s.change("p2", { label: "Move", dt: 16 });
    s.change("p3", { label: "Move", dt: 16 });
    expect(s.h.past).toHaveLength(1);
    s.undo();
    expect(s.present).toBe("p0");
  });

  it("does not coalesce across labels, groupKeys or slow changes", () => {
    const s = store("a");
    s.change("b", { label: "Move" });
    s.change("c", { label: "Rename", dt: 10 });
    s.change("d", { label: "Rename", groupKey: "other", dt: 10 });
    s.change("e", { label: "Rename", groupKey: "other", dt: 600 });
    expect(s.h.past).toHaveLength(4);
  });

  it("labels describe the change being undone/redone", () => {
    const s = store("a");
    s.change("b", { label: "Move control" });
    expect(undoLabel(s.h)).toBe("Move control");
    s.undo();
    expect(redoLabel(s.h)).toBe("Move control");
  });

  it("tracks the saved state through undo and redo", () => {
    const s = store("a");
    expect(isSaved(s.h)).toBe(true);
    s.change("b");
    expect(isSaved(s.h)).toBe(false);
    s.save();
    expect(isSaved(s.h)).toBe(true);
    s.undo();
    expect(isSaved(s.h)).toBe(false);
    s.redo();
    expect(isSaved(s.h)).toBe(true);
  });

  it("never coalesces into a saved state", () => {
    const s = store("a");
    s.change("b", { label: "Move" });
    s.save();
    s.change("c", { label: "Move", dt: 10 });
    expect(s.h.past).toHaveLength(2);
    s.undo();
    expect(s.present).toBe("b");
    expect(isSaved(s.h)).toBe(true);
  });

  it("forgets the saved state when it is discarded from the redo stack", () => {
    const s = store("a");
    s.change("b");
    s.save();
    s.undo();
    s.change("x");
    expect(s.h.savedIndex).toBeNull();
    expect(isSaved(s.h)).toBe(false);
  });

  it("keeps at most `limit` steps and shifts the saved index", () => {
    let h: HistoryState<number> = createHistory();
    for (let i = 0; i < 5; i++) h = recordChange(h, i, { now: i * 1000, limit: 3 });
    expect(h.past.map((e) => e.state)).toEqual([2, 3, 4]);
    expect(h.savedIndex).toBeNull(); // saved state (0) was dropped
    let g: HistoryState<number> = createHistory();
    g = recordChange(g, 0, { now: 0, limit: 2 });
    g = markSaved(g); // savedIndex 1
    g = recordChange(g, 1, { now: 1000, limit: 2 });
    g = recordChange(g, 2, { now: 2000, limit: 2 });
    expect(g.savedIndex).toBe(0);
  });

  it("dropOldestWhile trims until the predicate is false", () => {
    let h: HistoryState<number> = createHistory();
    for (let i = 0; i < 4; i++) h = recordChange(h, i, { now: i * 1000 });
    const trimmed = dropOldestWhile(h, (x) => x.past.length > 2);
    expect(trimmed.past.map((e) => e.state)).toEqual([2, 3]);
  });

  it("undo/redo on an empty history return null", () => {
    const h = createHistory<string>();
    expect(undo(h, "a")).toBeNull();
    expect(redo(h, "a")).toBeNull();
  });
});
