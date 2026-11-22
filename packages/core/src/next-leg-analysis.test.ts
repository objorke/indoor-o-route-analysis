import { describe, it, expect, vi } from "vitest";
import { analyzeNextLegs } from "./next-leg-analysis";

type Finder = Parameters<typeof analyzeNextLegs>[0];

function fakeAnalyzer(opts: { failFor?: string[]; noRouteFor?: string[]; onCall?: (to: string) => void } = {}): Finder {
  return {
    findAlternativePathsBetweenControls: (_from: string, to: string) => {
      opts.onCall?.(to);
      if (opts.failFor?.includes(to)) throw new Error("boom");
      if (opts.noRouteFor?.includes(to)) return [];
      return [{ distance: to.length * 10, difficulty: 2 }] as never;
    },
  } as Finder;
}

describe("analyzeNextLegs", () => {
  it("analyzes all candidates and reports progress", async () => {
    const progress: number[] = [];
    const out = await analyzeNextLegs(fakeAnalyzer(), "S", ["a", "bb", "ccc"], {
      onProgress: (p) => progress.push(p.done),
    });
    expect(out.aborted).toBe(false);
    expect(out.results.map((r) => r.controlId)).toEqual(["a", "bb", "ccc"]);
    expect(out.results[1]).toEqual({ controlId: "bb", distance: 20, difficulty: 2 });
    expect(progress).toEqual([0, 1, 2, 3]);
  });

  it("skips candidates without a route or that throw", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = await analyzeNextLegs(fakeAnalyzer({ failFor: ["a"], noRouteFor: ["bb"] }), "S", ["a", "bb", "ccc"]);
    expect(out.results.map((r) => r.controlId)).toEqual(["ccc"]);
    warn.mockRestore();
  });

  it("returns immediately when the signal is already aborted", async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const onCall = vi.fn();
    const out = await analyzeNextLegs(fakeAnalyzer({ onCall }), "S", ["a", "b"], { signal: ctrl.signal });
    expect(out).toEqual({ results: [], aborted: true });
    expect(onCall).not.toHaveBeenCalled();
  });

  it("stops after the current candidate when aborted mid-run, keeping partial results", async () => {
    const ctrl = new AbortController();
    const out = await analyzeNextLegs(
      fakeAnalyzer({ onCall: (to) => { if (to === "b") ctrl.abort(); } }),
      "S",
      ["a", "b", "c", "d"],
      { signal: ctrl.signal, timeSliceMs: 0 },
    );
    expect(out.aborted).toBe(true);
    expect(out.results.map((r) => r.controlId)).toEqual(["a", "b"]);
  });

  it("handles an empty candidate list", async () => {
    const out = await analyzeNextLegs(fakeAnalyzer(), "S", []);
    expect(out).toEqual({ results: [], aborted: false });
  });
});
