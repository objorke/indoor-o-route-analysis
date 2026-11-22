import { describe, it, expect } from "vitest";
import { findTrapEasierRoute } from "./course-analysis";

describe("findTrapEasierRoute", () => {
  it("returns the easiest longer route when it is easier than the shortest", () => {
    const routes = [
      { distance: 100, difficulty: 40 },
      { distance: 130, difficulty: 30 },
      { distance: 150, difficulty: 20 },
    ];
    expect(findTrapEasierRoute(40, routes)).toBe(routes[2]);
  });

  it("returns undefined when the shortest route is also the easiest", () => {
    const routes = [
      { distance: 100, difficulty: 20 },
      { distance: 150, difficulty: 30 },
    ];
    expect(findTrapEasierRoute(20, routes)).toBeUndefined();
  });

  it("ignores differences that vanish when rounded", () => {
    const routes = [
      { distance: 100, difficulty: 30.2 },
      { distance: 150, difficulty: 29.9 },
    ];
    expect(findTrapEasierRoute(30.2, routes)).toBeUndefined();
  });

  it("ignores equally short routes and missing difficulties", () => {
    const routes = [
      { distance: 100, difficulty: 40 },
      { distance: 100, difficulty: 10 },
      { distance: 200 },
    ];
    expect(findTrapEasierRoute(40, routes)).toBeUndefined();
  });

  it("requires the easiest route to be more than 10% longer", () => {
    const shortest = { distance: 100, difficulty: 40 };
    expect(findTrapEasierRoute(40, [shortest, { distance: 110, difficulty: 20 }])).toBeUndefined();
    const longer = { distance: 111, difficulty: 20 };
    expect(findTrapEasierRoute(40, [shortest, longer])).toBe(longer);
  });

  it("does not fall back to a harder route when the easiest is a small detour", () => {
    const routes = [
      { distance: 100, difficulty: 40 },
      { distance: 105, difficulty: 20 },
      { distance: 150, difficulty: 30 },
    ];
    expect(findTrapEasierRoute(40, routes)).toBeUndefined();
  });

  it("accepts a custom distance ratio", () => {
    const routes = [
      { distance: 100, difficulty: 40 },
      { distance: 105, difficulty: 20 },
    ];
    expect(findTrapEasierRoute(40, routes, 0)).toBe(routes[1]);
    expect(findTrapEasierRoute(40, [routes[0], { distance: 150, difficulty: 39 }], 0.1, 0)).toBeDefined();
  });

  it("requires the easiest route to be more than 10% easier", () => {
    const shortest = { distance: 100, difficulty: 40 };
    expect(findTrapEasierRoute(40, [shortest, { distance: 150, difficulty: 36 }])).toBeUndefined();
    const easier = { distance: 150, difficulty: 35 };
    expect(findTrapEasierRoute(40, [shortest, easier])).toBe(easier);
  });

  it("handles empty input and non-finite difficulty", () => {
    expect(findTrapEasierRoute(40, [])).toBeUndefined();
    expect(findTrapEasierRoute(NaN, [{ distance: 1, difficulty: 1 }, { distance: 2, difficulty: 0 }])).toBeUndefined();
  });
});
