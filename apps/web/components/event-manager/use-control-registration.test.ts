import { describe, it, expect } from "vitest";
import type { Control } from "@indoor-o-route-analysis/core";
import { farthestControlPair } from "./use-control-registration";

const ctrl = (id: string, x: number, y: number) => ({ id, mapPosition: { x, y } }) as Control;

describe("farthestControlPair", () => {
  it("returns null for fewer than two controls", () => {
    expect(farthestControlPair([])).toBeNull();
    expect(farthestControlPair([ctrl("31", 0, 0)])).toBeNull();
  });

  it("picks the two controls farthest apart", () => {
    const pair = farthestControlPair([ctrl("31", 10, 10), ctrl("32", 0, 100), ctrl("33", 90, 0), ctrl("34", 50, 50)]);
    expect(pair?.map((c) => c.id).sort()).toEqual(["32", "33"]);
  });

  it("works for controls on the same row", () => {
    const pair = farthestControlPair([ctrl("31", 0, 5), ctrl("32", 40, 5), ctrl("33", 20, 5)]);
    expect(pair?.map((c) => c.id).sort()).toEqual(["31", "32"]);
  });
});
