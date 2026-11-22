import { describe, it, expect, vi } from "vitest";
import { createNoticeStore } from "./notice-store";

describe("notice store", () => {
  it("adds and dismisses notices, keeping the latest four", () => {
    const store = createNoticeStore();
    const listener = vi.fn();
    store.subscribe(listener);
    const ids = [1, 2, 3, 4, 5].map((i) => store.notify(`m${i}`, { kind: i === 5 ? "error" : undefined }));
    expect(store.getState().notices.map((n) => n.message)).toEqual(["m2", "m3", "m4", "m5"]);
    expect(store.getState().notices[3].kind).toBe("error");
    store.dismiss(ids[2]);
    expect(store.getState().notices.map((n) => n.message)).toEqual(["m2", "m4", "m5"]);
    expect(listener).toHaveBeenCalledTimes(6);
  });

  it("confirm resolves with the answer and queues concurrent requests", async () => {
    const store = createNoticeStore();
    const first = store.confirm("Delete?", { confirmLabel: "Delete", destructive: true });
    const second = store.confirm("Really?");
    expect(store.getState().confirm?.message).toBe("Delete?");
    expect(store.getState().confirm?.destructive).toBe(true);
    store.answer(true);
    expect(store.getState().confirm?.message).toBe("Really?");
    store.answer(false);
    expect(store.getState().confirm).toBeNull();
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
  });

  it("answer without an open request is a no-op", () => {
    const store = createNoticeStore();
    expect(() => store.answer(true)).not.toThrow();
  });
});
