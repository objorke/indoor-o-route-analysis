import { describe, it, expect } from "vitest";
import { calculateTransformFromControlPairs } from "./control-registration";

// Ground truth: TL (100, 200), uniform 2 event units per doc mm, Y down; doc 300 × 150 mm
const W = 300;
const H = 150;
const toEvent = (d: { x: number; y: number }, k = 2, sy = 1) => ({ x: 100 + k * d.x, y: 200 + sy * k * d.y });

describe("calculateTransformFromControlPairs", () => {
  it("non-uniform: reproduces an exact transform", () => {
    const d1 = { x: 10, y: 20 };
    const d2 = { x: 200, y: 120 };
    const r = calculateTransformFromControlPairs(toEvent(d1), d1, toEvent(d2), d2, W, H)!;
    expect(r.topLeft.x).toBeCloseTo(100);
    expect(r.topLeft.y).toBeCloseTo(200);
    expect(r.bottomRight.x).toBeCloseTo(700);
    expect(r.bottomRight.y).toBeCloseTo(500);
    expect(r.maxError).toBe(0);
  });

  it("non-uniform: returns null for marks on the same row", () => {
    const d1 = { x: 10, y: 20 };
    const d2 = { x: 200, y: 20 };
    expect(calculateTransformFromControlPairs(toEvent(d1), d1, toEvent(d2), d2, W, H)).toBeNull();
  });

  it("uniform: reproduces an exact transform", () => {
    const d1 = { x: 10, y: 20 };
    const d2 = { x: 200, y: 120 };
    const r = calculateTransformFromControlPairs(toEvent(d1), d1, toEvent(d2), d2, W, H, { uniform: true })!;
    expect(r.topLeft.x).toBeCloseTo(100);
    expect(r.topLeft.y).toBeCloseTo(200);
    expect(r.bottomRight.x).toBeCloseTo(700);
    expect(r.bottomRight.y).toBeCloseTo(500);
    expect(r.maxError).toBeCloseTo(0);
  });

  it("uniform: succeeds for marks on the same row and uses the fallback orientation", () => {
    const d1 = { x: 10, y: 20 };
    const d2 = { x: 200, y: 20 };
    const r = calculateTransformFromControlPairs(toEvent(d1, 2, -1), d1, toEvent(d2, 2, -1), d2, W, H, {
      uniform: true,
      orientation: { x: 1, y: -1 },
    })!;
    expect(r).not.toBeNull();
    expect(r.bottomRight.x - r.topLeft.x).toBeCloseTo(2 * W);
    expect(r.bottomRight.y - r.topLeft.y).toBeCloseTo(-2 * H);
    expect(r.maxError).toBeCloseTo(0);
  });

  it("uniform: derives a Y-up orientation from the data", () => {
    const d1 = { x: 10, y: 20 };
    const d2 = { x: 200, y: 120 };
    const r = calculateTransformFromControlPairs(toEvent(d1, 2, -1), d1, toEvent(d2, 2, -1), d2, W, H, { uniform: true })!;
    expect(r.bottomRight.y).toBeLessThan(r.topLeft.y);
  });

  it("uniform: noisy data gives the least-squares scale and a residual", () => {
    const d1 = { x: 0, y: 0 };
    const d2 = { x: 100, y: 100 };
    // x says k = 2, y says k = 3 → least squares k = 2.5
    const e1 = { x: 0, y: 0 };
    const e2 = { x: 200, y: 300 };
    const r = calculateTransformFromControlPairs(e1, d1, e2, d2, W, H, { uniform: true })!;
    expect((r.bottomRight.x - r.topLeft.x) / W).toBeCloseTo(2.5);
    expect((r.bottomRight.y - r.topLeft.y) / H).toBeCloseTo(2.5);
    expect(r.maxError).toBeGreaterThan(0);
    expect(r.maxError).toBeCloseTo(Math.hypot(25, 25));
  });

  it("uniform: returns null when the marks coincide", () => {
    const d = { x: 10, y: 10 };
    expect(calculateTransformFromControlPairs({ x: 0, y: 0 }, d, { x: 5, y: 5 }, d, W, H, { uniform: true })).toBeNull();
  });
});
