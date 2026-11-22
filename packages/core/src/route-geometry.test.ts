import { describe, it, expect } from "vitest";
import {
  calculateEdgeDistanceMeters,
  calculatePathDistance,
  calculatePathDistanceThroughGraph,
  calculateStraightLineDistance,
  calculateRouteDistance,
  calculateCourseLength,
  getPolygonForNodeOrControl,
  buildPathPolygons,
  calculatePathClimb,
} from "./route-geometry";
import type { Control } from "./models/control";
import type { Node, Edge } from "./models/graph";
import type { Polygon } from "./models/polygon";
import type { PathResult } from "./route-search";

const mapScale = 1; // 1 map unit = 1mm, so straightLineDistanceMeters(a, b, 1) == raw hypot / 1000... see utils/geometry

describe("calculateEdgeDistanceMeters", () => {
  const a: Node = { id: "a", x: 0, y: 0 };
  const b: Node = { id: "b", x: 1000, y: 0 }; // 1000mm -> 1m at mapScale 1

  it("returns Infinity when either endpoint is null", () => {
    expect(calculateEdgeDistanceMeters(undefined, null, b, mapScale)).toBe(Number.POSITIVE_INFINITY);
    expect(calculateEdgeDistanceMeters(undefined, a, null, mapScale)).toBe(Number.POSITIVE_INFINITY);
  });

  it("computes straight-line distance for a regular edge", () => {
    const edge: Edge = { from: "a", to: "b", label: "" };
    expect(calculateEdgeDistanceMeters(edge, a, b, mapScale)).toBeCloseTo(1, 5);
  });

  it("returns 0 for an ignoreLength edge regardless of endpoint distance", () => {
    const edge: Edge = { from: "a", to: "b", label: "", ignoreLength: true };
    expect(calculateEdgeDistanceMeters(edge, a, b, mapScale)).toBe(0);
  });

  it("uses a hand-set edge length instead of the calculated one, also over ignoreLength", () => {
    expect(calculateEdgeDistanceMeters({ from: "a", to: "b", label: "", length: 7.5 }, a, b, mapScale)).toBe(7.5);
    expect(calculateEdgeDistanceMeters({ from: "a", to: "b", label: "", ignoreLength: true, length: 3 }, a, b, mapScale)).toBe(3);
    expect(calculateEdgeDistanceMeters({ from: "a", to: "b", label: "", length: 0 }, a, b, mapScale)).toBe(0);
    // Invalid values fall back to the calculated length
    expect(calculateEdgeDistanceMeters({ from: "a", to: "b", label: "", length: -1 }, a, b, mapScale)).toBeCloseTo(1, 5);
    expect(calculateEdgeDistanceMeters({ from: "a", to: "b", label: "", length: Number.NaN }, a, b, mapScale)).toBeCloseTo(1, 5);
    // Penalties still apply on top
    const penalties = new Map([["a:b", 2]]);
    expect(calculateEdgeDistanceMeters({ from: "a", to: "b", label: "", length: 7.5 }, a, b, mapScale, penalties)).toBe(15);
  });

  it("applies a penalty multiplier keyed by from:to", () => {
    const edge: Edge = { from: "a", to: "b", label: "" };
    const penalties = new Map([["a:b", 2]]);
    expect(calculateEdgeDistanceMeters(edge, a, b, mapScale, penalties)).toBeCloseTo(2, 5);
  });
});

describe("calculatePathDistance", () => {
  const nodes = new Map<string, Node>([
    ["a", { id: "a", x: 0, y: 0 }],
    ["b", { id: "b", x: 1000, y: 0 }],
    ["c", { id: "c", x: 2000, y: 0 }],
  ]);
  const edges: Edge[] = [
    { from: "a", to: "b", label: "" },
    { from: "b", to: "c", label: "" },
  ];
  const ctx = {
    resolveNode: (id: string) => nodes.get(id) ?? null,
    findEdge: (from: string, to: string) => edges.find((e) => e.from === from && e.to === to),
    mapScale,
  };

  it("sums edge distances along the path", () => {
    expect(calculatePathDistance(["a", "b", "c"], ctx)).toBeCloseTo(2, 5);
  });
});

describe("calculatePathDistanceThroughGraph", () => {
  it("returns 0 for fewer than 2 waypoints", () => {
    expect(calculatePathDistanceThroughGraph(["a"], () => null)).toBe(0);
  });

  it("sums shortest-path distances between consecutive waypoints", () => {
    const results: Record<string, PathResult> = {
      "a->b": { distance: 3, path: ["a", "b"] },
      "b->c": { distance: 4, path: ["b", "c"] },
    };
    const findShortestPathBetween = (from: string, to: string) => results[`${from}->${to}`] ?? null;
    expect(calculatePathDistanceThroughGraph(["a", "b", "c"], findShortestPathBetween)).toBe(7);
  });

  it("returns Infinity when any waypoint pair is unreachable", () => {
    const findShortestPathBetween = () => null;
    expect(calculatePathDistanceThroughGraph(["a", "b"], findShortestPathBetween)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("calculateStraightLineDistance", () => {
  it("computes Euclidean distance between two controls", () => {
    const c1: Control = { id: "c1", type: "control", mapPosition: { x: 0, y: 0 } };
    const c2: Control = { id: "c2", type: "control", mapPosition: { x: 1000, y: 0 } };
    expect(calculateStraightLineDistance(c1, c2, mapScale)).toBeCloseTo(1, 5);
  });
});

describe("calculateRouteDistance", () => {
  const c1: Control = { id: "c1", type: "control", mapPosition: { x: 0, y: 0 } };
  const c2: Control = { id: "c2", type: "control", mapPosition: { x: 1000, y: 0 } };

  it("falls back to straight-line distance when a control has no mapped node", () => {
    const ctx = {
      controlNodeMap: new Map<string, string>(),
      mapScale,
      findShortestPathBetween: () => null,
    };
    expect(calculateRouteDistance(c1, c2, ctx)).toBeCloseTo(1, 5);
  });

  it("uses the shortest-path distance when both controls map to graph nodes", () => {
    const ctx = {
      controlNodeMap: new Map([["c1", "n1"], ["c2", "n2"]]),
      mapScale,
      findShortestPathBetween: (from: string, to: string) =>
        from === "n1" && to === "n2" ? { distance: 5, path: ["n1", "n2"] } : null,
    };
    expect(calculateRouteDistance(c1, c2, ctx)).toBe(5);
  });

  it("falls back to straight-line distance when no path exists between the mapped nodes", () => {
    const ctx = {
      controlNodeMap: new Map([["c1", "n1"], ["c2", "n2"]]),
      mapScale,
      findShortestPathBetween: () => null,
    };
    expect(calculateRouteDistance(c1, c2, ctx)).toBeCloseTo(1, 5);
  });
});

describe("calculateCourseLength", () => {
  it("sums route distances across all legs", () => {
    const controls: Control[] = [
      { id: "c1", type: "start", mapPosition: { x: 0, y: 0 } },
      { id: "c2", type: "control", mapPosition: { x: 1000, y: 0 } },
      { id: "c3", type: "finish", mapPosition: { x: 2000, y: 0 } },
    ];
    const ctx = {
      controlNodeMap: new Map<string, string>(),
      mapScale,
      findShortestPathBetween: () => null,
    };
    expect(calculateCourseLength(controls, ctx)).toBeCloseTo(2, 5);
  });
});

describe("getPolygonForNodeOrControl", () => {
  const polygons: Polygon[] = [
    { id: "p1", level: 1, points: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }] },
  ];

  it("returns undefined when there are no polygons", () => {
    const node: Node = { id: "n", x: 0, y: 0 };
    expect(getPolygonForNodeOrControl(node, [])).toBeUndefined();
  });

  it("finds the polygon containing a node's position", () => {
    const node: Node = { id: "n", x: 0, y: 0 };
    expect(getPolygonForNodeOrControl(node, polygons)?.id).toBe("p1");
  });

  it("reads a control's position from mapPosition", () => {
    const control: Control = { id: "c", type: "control", mapPosition: { x: 0, y: 0 } };
    expect(getPolygonForNodeOrControl(control, polygons)?.id).toBe("p1");
  });

  it("returns undefined outside any polygon", () => {
    const node: Node = { id: "n", x: 1000, y: 1000 };
    expect(getPolygonForNodeOrControl(node, polygons)).toBeUndefined();
  });
});

describe("buildPathPolygons", () => {
  it("maps each path node to its polygon, in order", () => {
    const polygons: Polygon[] = [
      { id: "p1", level: 1, points: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }] },
    ];
    const nodes = new Map<string, Node>([
      ["inside", { id: "inside", x: 0, y: 0 }],
      ["outside", { id: "outside", x: 1000, y: 1000 }],
    ]);
    const result = buildPathPolygons(["inside", "outside"], (id) => nodes.get(id) ?? null, polygons);
    expect(result[0]?.id).toBe("p1");
    expect(result[1]).toBeUndefined();
  });

  it("returns undefined for a path node that doesn't resolve", () => {
    const result = buildPathPolygons(["missing"], () => null, []);
    expect(result).toEqual([undefined]);
  });
});

describe("calculatePathClimb", () => {
  const level1: Polygon = { id: "p1", level: 1, points: [] };
  const level3: Polygon = { id: "p2", level: 3, points: [] };

  it("sums only upward elevation changes (level * 3 fallback)", () => {
    // level 1 -> level 3 is +6m up, but level 3 -> level 1 (descent) contributes 0
    expect(calculatePathClimb(["a", "b", "c"], [level1, level3, level1])).toBe(6);
  });

  it("prefers explicit elevation over the level*3 fallback", () => {
    const withElevation: Polygon = { id: "p3", level: 1, points: [], elevation: 100 };
    expect(calculatePathClimb(["a", "b"], [level1, withElevation])).toBe(97); // 100 - 3
  });

  it("treats a missing polygon as elevation 0", () => {
    expect(calculatePathClimb(["a", "b"], [undefined, level1])).toBe(3);
  });
});
