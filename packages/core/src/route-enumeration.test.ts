import { describe, it, expect } from "vitest";
import { findAllAlternativePaths, type RouteEnumerationContext } from "./route-enumeration";
import type { Edge } from "./models/graph";
import { makeContext, node } from "./test-helpers/route-enumeration-context";

describe("findAllAlternativePaths", () => {
  it("finds the only route when there is no alternative", () => {
    const nodes = [node("S", 0, 0), node("T", 10, 0)];
    const edges: Edge[] = [{ from: "S", to: "T", label: "" }];
    const { routes, truncated } = findAllAlternativePaths("S", "T", makeContext(nodes, edges));
    expect(routes).toHaveLength(1);
    expect(routes[0].path).toEqual(["S", "T"]);
    expect(routes[0].labels).toEqual([]);
    expect(truncated).toBe(false);
  });

  // Two floor clusters, F1={S,A,A2} and F2={B,B2,T}, joined by two
  // alternative stairs: "1" (via A, short) and "2" (via A2, much longer).
  const nodes = [
    node("S", 0, 0), node("A", 5, 0),
    node("B", 5, 100), node("T", 20, 100),
    node("A2", 50, 0), node("B2", 50, 100),
  ];
  const edges: Edge[] = [
    { from: "S", to: "A", label: "" },
    { from: "S", to: "A2", label: "" },
    { from: "B", to: "T", label: "" },
    { from: "B2", to: "T", label: "" },
    { from: "A", to: "B", label: "1", reverseLabel: "1", ignoreLength: true },
    { from: "A2", to: "B2", label: "2", reverseLabel: "2", ignoreLength: true },
  ];

  it("enumerates every distinct label sequence, sorted shortest first", () => {
    const { routes, truncated } = findAllAlternativePaths("S", "T", makeContext(nodes, edges));
    expect(routes.map((r) => r.labels)).toEqual([["1"], ["2"]]);
    expect(routes[0].distance).toBeLessThan(routes[1].distance);
    expect(truncated).toBe(false);
  });

  it("reports truncated when maxResults is smaller than the number of distinct sequences", () => {
    const { routes, truncated } = findAllAlternativePaths("S", "T", makeContext(nodes, edges), 1);
    expect(routes).toHaveLength(1);
    expect(routes[0].labels).toEqual(["1"]);
    expect(truncated).toBe(true);
  });

  it("prunes routes beyond the distance cutoff", () => {
    // shortest overall is 20m (via stair "1"); a ratio*absolute cutoff of
    // exactly 20m keeps "1" but excludes "2" (80m).
    const { routes } = findAllAlternativePaths("S", "T", makeContext(nodes, edges), 1000, { ratio: 1, absoluteMeters: 0 });
    expect(routes.map((r) => r.labels)).toEqual([["1"]]);
  });

  it("fires onRouteFound once per accepted route, in rank order", () => {
    const found: Array<{ labels: string[]; rank: number }> = [];
    const ctx: RouteEnumerationContext = {
      ...makeContext(nodes, edges),
      hooks: { onRouteFound: (route, rank) => found.push({ labels: route.labels, rank }) },
    };
    findAllAlternativePaths("S", "T", ctx);
    expect(found).toEqual([{ labels: ["1"], rank: 0 }, { labels: ["2"], rank: 1 }]);
  });

  it("does not double-count two physical paths that produce the same visible label sequence", () => {
    // Add a second, unlabeled shortcut from S straight to B (same floor
    // as... no: unlabeled edges never cross floors, so this models two
    // same-floor corridors both reaching A before stair "1" - same label
    // sequence "1" either way, must be deduped to one result.
    const withShortcut: Edge[] = [...edges, { from: "S", to: "A", label: "" }];
    const { routes } = findAllAlternativePaths("S", "T", makeContext(nodes, withShortcut));
    const ones = routes.filter((r) => r.labels.join(",") === "1");
    expect(ones).toHaveLength(1);
  });
});
